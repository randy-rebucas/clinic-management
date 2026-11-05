'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { DisplayEntry, DoctorLine, QueueDisplayData } from '@/lib/queue-display';
import { AD_MS, adAtTick, spokenCall, waitText, YOUTUBE_ORIGIN, youtubeEmbedUrl } from '@/lib/queue-media';

/** A called number reaches the room within this, plus the server's few seconds of shared read. */
const POLL_MS = 20_000;
/** A closed clinic's board. The first patient of the day shows within this time. */
const CLOSED_POLL_MS = 5 * 60_000;
const CLOCK_MS = 15_000;
/** How long a new call fills the screen. Shorter than a poll, so calls never stack up. */
const CALL_MS = 9_000;
/** Lets the chime finish before the voice starts. */
const SPEAK_AFTER_MS = 700;
const CALL_CARDS_MAX = 4;
/** The player ignores commands until it has loaded, so the sound state is repeated, not sent once. */
const PLAYER_SYNC_MS = 2_000;

const SOUND_KEY = 'queue-display-sound';
const RELOAD_KEY = 'queue-display-reloaded-for';

const clockText = (at: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at);
const dateText = (at: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(at);

/** Cards shrink as more doctors call at once, so six still fit beside the reconnecting line. */
const SERVING = {
  solo: { grid: '', number: 'text-[max(4rem,20vmin)]', detail: 'text-[max(1.5rem,5vmin)]' },
  pair: { grid: 'sm:grid-cols-2', number: 'text-[max(3rem,11vmin)]', detail: 'text-[max(1.125rem,3.2vmin)]' },
  dense: { grid: 'sm:grid-cols-2 lg:grid-cols-3', number: 'text-[max(2.5rem,8vmin)]', detail: 'text-[max(1rem,2.6vmin)]' },
};

/** Beside the videos the queue has a narrow column: six calls only fit while few are waiting. */
const COMPACT_SERVING = 4;
const COMPACT_SERVING_QUIET = 6;
const QUIET_LINE = 2;
/** Six doctor cards don't fit that column beside the ticker and the reconnecting line. */
const COMPACT_DOCTORS = 5;

const placeOf = (e: DisplayEntry) => [e.room, e.doctor].filter(Boolean).join(' · ');
const latestCall = (entries: DisplayEntry[]) => Math.max(0, ...entries.map((e) => e.calledAt ?? 0));

/** Storage can be blocked on a kiosk browser; the screen works without it. */
function remembered(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

/** Reloads once per deploy, so a server that keeps answering differently can't start a loop. */
function reloadFor(version: string) {
  if (remembered(RELOAD_KEY) === version) return;
  remember(RELOAD_KEY, version);
  window.location.reload();
}

function chime(audio: AudioContext) {
  const start = audio.currentTime;
  [
    [660, 0],
    [880, 0.22],
  ].forEach(([pitch, delay]) => {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = 'triangle';
    tone.frequency.value = pitch;
    volume.gain.setValueAtTime(0.0001, start + delay);
    volume.gain.exponentialRampToValueAtTime(0.4, start + delay + 0.03);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.5);
    tone.connect(volume).connect(audio.destination);
    tone.start(start + delay);
    tone.stop(start + delay + 0.55);
  });
}

function say(text: string) {
  if (!('speechSynthesis' in window)) return;
  const words = new SpeechSynthesisUtterance(text);
  words.rate = 0.9;
  window.speechSynthesis.speak(words);
}

/**
 * Browsers keep a page silent until someone interacts with it, so staff switch sound on once,
 * for the calls and the videos alike. The choice is remembered: a screen that reloads itself turns sound back on where the browser lets it.
 */
function useCallSound(calling: DisplayEntry[]) {
  const [on, setOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (remembered(SOUND_KEY) !== 'on') return;
    audio.current = new AudioContext();
    // Stays pending, not rejected, while the browser wants a tap first.
    void audio.current.resume().then(() => setOn(true));
  }, []);

  useEffect(() => {
    if (!on || calling.length === 0 || !audio.current) return;
    chime(audio.current);
    const id = window.setTimeout(() => calling.forEach((e) => say(spokenCall(e))), SPEAK_AFTER_MS);
    return () => window.clearTimeout(id);
    // A new call, not the switch being flipped mid-call, is what announces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calling]);

  const toggle = () => {
    if (on) {
      setOn(false);
      remember(SOUND_KEY, 'off');
      return;
    }
    audio.current ??= new AudioContext();
    void audio.current.resume();
    chime(audio.current);
    say('Sound is on');
    setOn(true);
    remember(SOUND_KEY, 'on');
  };

  return { on, toggle };
}

/** A TV browser left alone would otherwise let the screen sleep. Not every browser offers this. */
function useKeepAwake(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const hold = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock?.request('screen');
        if (gone) void next?.release();
        else lock = next ?? null;
      } catch {}
    };
    void hold();
    // The browser drops the lock whenever the page is hidden.
    document.addEventListener('visibilitychange', hold);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', hold);
      void lock?.release();
    };
  }, [enabled]);
}

export default function QueueDisplayClient({
  initial,
  clinicName,
  timeZone,
  query,
}: {
  initial: QueueDisplayData;
  clinicName: string;
  timeZone: string;
  query: string;
}) {
  const [data, setData] = useState(initial);
  const [fresh, setFresh] = useState<string[]>([]);
  const [calling, setCalling] = useState<DisplayEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [lastGood, setLastGood] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const [switchedOff, setSwitchedOff] = useState(false);
  const closed = useRef(!!initial.closed);
  const lastCall = useRef(latestCall(initial.nowServing));
  const nextIds = useRef(initial.nextUp.map((e) => e.id));
  const sound = useCallSound(calling);
  useKeepAwake(!data.closed && !switchedOff);

  // Nobody is at this screen to refresh it, so it has to survive dropped Wi-Fi and a bad response
  // alone: keep the last board, say it may be out of date, and keep trying.
  useEffect(() => {
    let inFlight = false;
    let lastLoad = Date.now();
    const load = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      lastLoad = Date.now();
      try {
        const res = await fetch(`/api/queue/display/data${query ? `?${query}` : ''}`, { cache: 'no-store' });
        if (res.status === 403) {
          setSwitchedOff(true);
          return;
        }
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error);
        const next: QueueDisplayData = body.data;
        closed.current = !!next.closed;
        // By call time, not by who is newly listed: someone older can return to a capped board.
        // Someone just seen waiting counts too, which catches a patient called back in.
        const newly = next.nowServing.filter((e) => (e.calledAt ?? 0) > lastCall.current || nextIds.current.includes(e.id));
        lastCall.current = Math.max(lastCall.current, latestCall(next.nowServing));
        nextIds.current = next.nextUp.map((e) => e.id);
        if (next.version && initial.version && next.version !== initial.version && newly.length === 0) reloadFor(next.version);
        setFresh(newly.map((e) => e.id));
        if (newly.length > 0) setCalling(newly);
        setData(next);
        setSwitchedOff(false);
        setOffline(false);
        setLastGood(Date.now());
      } catch {
        setOffline(true);
      } finally {
        inFlight = false;
      }
    };
    const poll = window.setInterval(() => {
      if (!closed.current || Date.now() - lastLoad >= CLOSED_POLL_MS) void load();
    }, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', load);
    };
  }, [query, initial.version]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (calling.length === 0) return;
    const id = window.setTimeout(() => setCalling([]), CALL_MS);
    return () => window.clearTimeout(id);
  }, [calling]);

  if (switchedOff) return <QueueDisplayOff />;

  const hasMedia = data.media.videos.length > 0 || data.media.ads.length > 0;
  const servingSize: keyof typeof SERVING = data.nowServing.length === 1 ? 'solo' : data.nowServing.length <= 4 ? 'pair' : 'dense';
  const compactServing = data.nextUp.length > QUIET_LINE ? COMPACT_SERVING : COMPACT_SERVING_QUIET;

  return (
    <main className="flex min-h-dvh flex-col gap-[3vmin] bg-brand-navy p-[4vmin] text-white lg:h-dvh lg:overflow-hidden">
      <header className="flex items-center justify-between gap-[4vmin]">
        <h1 className="min-w-0 truncate text-[max(1.5rem,4.5vmin)] font-extrabold tracking-tight">{clinicName}</h1>
        <div className="flex shrink-0 items-center gap-[3vmin]">
          <button
            type="button"
            onClick={sound.toggle}
            aria-pressed={sound.on}
            className="inline-flex items-center gap-2 rounded-md border border-white/25 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {sound.on ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
            <span className="sr-only sm:not-sr-only">{sound.on ? 'Sound on' : 'Turn on sound'}</span>
          </button>
          <div className="text-right">
            <p className="font-mono text-[max(1.5rem,4.5vmin)] font-semibold leading-none" suppressHydrationWarning>
              {clockText(now, timeZone)}
            </p>
            <p className="mt-[0.8vmin] text-[max(0.875rem,2.2vmin)] text-gray-300" suppressHydrationWarning>
              {dateText(now, timeZone)}
            </p>
          </div>
        </div>
      </header>

      {offline && (
        <p role="status" className="rounded-md bg-amber-300 px-[3vmin] py-[1.2vmin] text-[max(1rem,2.6vmin)] font-semibold text-gray-900">
          Reconnecting. This board was last updated at <span className="font-mono">{clockText(lastGood, timeZone)}</span>; please listen for your number.
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {calling.length > 0 && `Now serving ${calling.map((e) => e.number).join(', ')}`}
      </p>

      {data.closed ? (
        <p className="flex min-h-0 flex-1 items-center justify-center text-center text-[max(2rem,8vmin)] font-extrabold tracking-tight">The clinic is closed</p>
      ) : hasMedia ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[3vmin] lg:grid-cols-[3fr_2fr] lg:portrait:grid-cols-1">
          <div className="flex min-h-0 flex-col gap-[2vmin]">
            <MediaSlot videos={data.media.videos} ads={data.media.ads} muted={!sound.on || calling.length > 0} />
            {data.checkInImage && <CheckInCard image={data.checkInImage} />}
          </div>
          <div className="flex min-h-0 flex-col gap-[2vmin] overflow-hidden lg:portrait:order-first">
            {data.lines ? (
              <DoctorLines lines={data.lines} moreDoctors={data.moreDoctors} fresh={fresh} compact />
            ) : (
              <>
                <h2 className="text-[max(1.125rem,3vmin)] font-semibold text-gray-300">Now serving</h2>
                {data.nowServing.length === 0 ? (
                  <p className="rounded-lg border border-white/15 p-[2.5vmin] text-[max(1rem,2.8vmin)] text-gray-300">
                    {data.waiting > 0 ? 'The next number will be called shortly' : 'No one in line right now'}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-[1.2vmin]">
                    {data.nowServing.slice(0, compactServing).map((e) => (
                      <li
                        key={e.id}
                        className={`flex items-center gap-[2.5vmin] rounded-lg bg-brand-teal-dark px-[2.5vmin] py-[0.6vmin] ${fresh.includes(e.id) ? 'ring-[0.6vmin] ring-amber-300 motion-safe:animate-pulse' : ''}`}
                      >
                        <span className="shrink-0 font-mono text-[max(1.5rem,5.5vmin)] font-semibold leading-none">{e.number}</span>
                        <span className="min-w-0 text-[max(0.875rem,2.3vmin)] leading-snug">
                          {e.name && <span className="block truncate">{e.name}</span>}
                          {placeOf(e) && <span className="block truncate font-semibold">{placeOf(e)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <WaitingHeading waiting={data.waiting} />
                {data.nextUp.length === 0 ? <p className="text-[max(1rem,2.6vmin)] text-gray-300">No one is waiting.</p> : <NextRows entries={data.nextUp} compact />}
              </>
            )}
          </div>
        </div>
      ) : data.lines ? (
        <div className="flex min-h-0 flex-1 flex-col gap-[2vmin]">
          <DoctorLines lines={data.lines} moreDoctors={data.moreDoctors} fresh={fresh} />
          {data.checkInImage && <CheckInCard image={data.checkInImage} />}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[3vmin] lg:grid-cols-[3fr_2fr] lg:portrait:grid-cols-1">
          <section aria-labelledby="serving-title" className="flex min-h-0 flex-col gap-[2vmin]">
            <h2 id="serving-title" className="text-[max(1.125rem,3vmin)] font-semibold text-gray-300">
              Now serving
            </h2>
            {data.nowServing.length === 0 ? (
              <p className="flex flex-1 items-center justify-center rounded-lg border border-white/15 p-[4vmin] text-center text-[max(1.25rem,4vmin)] text-gray-300">
                {data.waiting > 0 ? 'The next number will be called shortly' : 'No one in line right now'}
              </p>
            ) : (
              <ul className={`grid min-h-0 flex-1 auto-rows-fr gap-[2vmin] ${SERVING[servingSize].grid}`}>
                {data.nowServing.map((e) => (
                  <ServingCard key={e.id} entry={e} isNew={fresh.includes(e.id)} size={servingSize} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="next-title" className="flex min-h-0 flex-col gap-[2vmin]">
            <WaitingHeading id="next-title" waiting={data.waiting} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/15 px-[2.5vmin]">
              {data.nextUp.length === 0 ? <p className="py-[3vmin] text-[max(1rem,2.8vmin)] text-gray-300">No one is waiting.</p> : <NextRows entries={data.nextUp} />}
            </div>

            {data.checkInImage && <CheckInCard image={data.checkInImage} />}
          </section>
        </div>
      )}

      {data.ticker && <Ticker text={data.ticker} />}
      {calling.length > 0 && <CallOverlay calls={calling} />}
    </main>
  );
}

function WaitingHeading({ id, waiting }: { id?: string; waiting: number }) {
  return (
    <h2 id={id} className="flex items-baseline justify-between gap-[2vmin] text-[max(1.125rem,3vmin)] font-semibold text-gray-300">
      Next up
      <span className="text-[max(0.875rem,2.4vmin)] font-medium">
        <span className="font-mono">{waiting}</span> waiting
      </span>
    </h2>
  );
}

/**
 * Shows as many rows as the space holds at any screen size: rows that don't fit wrap into a second
 * column, which the list clips. The heading's count covers the rest of the line.
 */
function NextRows({ entries, compact = false }: { entries: DisplayEntry[]; compact?: boolean }) {
  return (
    <ol className="flex min-h-0 flex-1 flex-col flex-wrap content-start overflow-hidden">
      {entries.map((e, i) => (
        <li
          key={e.id}
          className={`flex w-full items-center ${i > 0 ? 'border-t border-white/15' : ''} ${compact ? 'gap-[2vmin] py-[0.7vmin]' : 'gap-[3vmin] py-[1.5vmin]'}`}
        >
          <span className={`shrink-0 font-mono font-semibold ${compact ? 'text-[max(1.125rem,3.6vmin)]' : 'w-[16vmin] min-w-20 text-[max(1.25rem,4vmin)]'}`}>{e.number}</span>
          <span className={`min-w-[35%] flex-1 truncate ${compact ? 'text-[max(0.875rem,2.4vmin)]' : 'text-[max(1rem,2.8vmin)]'}`}>{e.name}</span>
          <span className="min-w-0 truncate text-[max(0.875rem,2.2vmin)] text-gray-300">{e.doctor}</span>
          {e.waitMinutes !== null && <span className="shrink-0 font-mono text-[max(0.875rem,2.4vmin)] font-semibold">{waitText(e.waitMinutes)}</span>}
        </li>
      ))}
    </ol>
  );
}

function DoctorLines({ lines, moreDoctors, fresh, compact = false }: { lines: DoctorLine[]; moreDoctors: number; fresh: string[]; compact?: boolean }) {
  if (lines.length === 0) {
    return <p className="flex flex-1 items-center justify-center rounded-lg border border-white/15 p-[4vmin] text-center text-[max(1.25rem,4vmin)] text-gray-300">No one in line right now</p>;
  }
  const shown = compact ? lines.slice(0, COMPACT_DOCTORS) : lines;
  const hidden = moreDoctors + lines.length - shown.length;
  return (
    <>
      <ul className={`grid min-h-0 flex-1 auto-rows-fr gap-[1.5vmin] ${compact ? '' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {shown.map((line) => {
          const isNew = !!line.serving && fresh.includes(line.serving.id);
          return (
            <li
              key={line.id}
              className={`flex min-w-0 flex-col justify-center overflow-hidden rounded-lg px-[2.5vmin] ${compact ? 'gap-[0.3vmin] py-[0.6vmin] leading-tight' : 'gap-[0.6vmin] py-[1vmin]'} ${line.serving ? 'bg-brand-teal-dark' : 'border border-white/15'} ${isNew ? 'ring-[0.6vmin] ring-inset ring-amber-300 motion-safe:animate-pulse' : ''}`}
            >
              <p className={`flex items-baseline justify-between gap-[2vmin] font-semibold ${compact ? 'text-[max(0.875rem,2.3vmin)]' : 'text-[max(1rem,3vmin)]'}`}>
                <span className="min-w-0 truncate">{line.doctor}</span>
                <span className="shrink-0 font-medium">
                  <span className="font-mono">{line.waiting}</span> waiting
                </span>
              </p>
              {line.serving ? (
                <p className="flex items-baseline gap-[2vmin]">
                  <span className={`shrink-0 font-mono font-semibold leading-none ${compact ? 'text-[max(1.5rem,4.2vmin)]' : 'text-[max(2.5rem,8vmin)]'}`}>{line.serving.number}</span>
                  <span className={`min-w-0 truncate ${compact ? 'text-[max(0.875rem,2.3vmin)]' : 'text-[max(1rem,2.8vmin)]'}`}>{[line.serving.name, line.serving.room].filter(Boolean).join(' · ')}</span>
                </p>
              ) : (
                <p className={`text-gray-300 ${compact ? 'text-[max(0.875rem,2.3vmin)]' : 'text-[max(1rem,2.8vmin)]'}`}>No one called yet</p>
              )}
              {line.next.length > 0 && (
                <p className={`truncate ${compact ? 'text-[max(0.875rem,2.1vmin)]' : 'text-[max(0.875rem,2.6vmin)]'}`}>
                  Next <span className="font-mono font-semibold">{line.next.map((e) => e.number).join(', ')}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <p className="text-[max(0.875rem,2.4vmin)] text-gray-300">
          and <span className="font-mono">{hidden}</span> more {hidden === 1 ? 'doctor' : 'doctors'}
        </p>
      )}
    </>
  );
}

/** Fills the screen so a call reaches people who aren't watching the board. */
function CallOverlay({ calls }: { calls: DisplayEntry[] }) {
  const shown = calls.slice(0, CALL_CARDS_MAX);
  const solo = shown.length === 1;
  return (
    <div className="animate-fade-up-in fixed inset-0 z-50 flex flex-col items-center justify-center gap-[4vmin] bg-brand-teal-dark p-[4vmin] text-center text-white">
      <p className="text-[max(1.5rem,6vmin)] font-semibold">Now serving</p>
      <ul className={`grid w-full gap-[4vmin] ${solo ? '' : 'sm:grid-cols-2'}`}>
        {shown.map((e) => (
          <li key={e.id} className="min-w-0">
            <p className={`font-mono font-semibold leading-none ${solo ? 'text-[max(5rem,30vmin)]' : 'text-[max(3rem,16vmin)]'}`}>{e.number}</p>
            {e.name && <p className={`mt-[2vmin] truncate ${solo ? 'text-[max(1.5rem,7vmin)]' : 'text-[max(1.125rem,4vmin)]'}`}>{e.name}</p>}
            {placeOf(e) && <p className={`mt-[1vmin] truncate font-semibold ${solo ? 'text-[max(1.5rem,6vmin)]' : 'text-[max(1.125rem,3.6vmin)]'}`}>{placeOf(e)}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ticker({ text }: { text: string }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-md bg-white/10 py-[1vmin] text-[max(1rem,2.8vmin)] font-medium">
      <p className="queue-ticker" style={{ animationDuration: `${Math.max(18, text.length * 0.3)}s` }}>
        {text}
      </p>
    </div>
  );
}

function CheckInCard({ image }: { image: string }) {
  return (
    <div className="flex shrink-0 items-center gap-[2.5vmin] rounded-lg bg-white p-[1.5vmin] text-gray-900">
      {/* A data URL made on the server, so next/image has nothing to optimise. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Check-in QR code" className="h-[max(7rem,15vmin)] w-[max(7rem,15vmin)] shrink-0" />
      <p className="text-[max(1rem,2.6vmin)] font-semibold leading-snug">Have an appointment? Scan this in the eMCR app to check in.</p>
    </div>
  );
}

/**
 * The player stays mounted under the ads, so a video isn't restarted each time one shows. YouTube
 * letterboxes inside its frame, so the frame is sized to cover the slot at 16:9 and the slot trims it.
 */
function MediaSlot({ videos, ads, muted }: { videos: string[]; ads: string[]; muted: boolean }) {
  const [tick, setTick] = useState(0);
  const player = useRef<HTMLIFrameElement>(null);
  const hasAds = ads.length > 0;
  const hasVideos = videos.length > 0;

  // Quiet for as long as a call is being read out, which can outlast the call on screen.
  useEffect(() => {
    if (!hasVideos) return;
    const sync = () => {
      const quiet = muted || ('speechSynthesis' in window && window.speechSynthesis.speaking);
      player.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: quiet ? 'mute' : 'unMute', args: [] }), YOUTUBE_ORIGIN);
    };
    sync();
    const id = window.setInterval(sync, PLAYER_SYNC_MS);
    return () => window.clearInterval(id);
  }, [muted, hasVideos]);

  useEffect(() => {
    if (!hasAds) return;
    const id = window.setInterval(() => setTick((t) => t + 1), AD_MS);
    return () => window.clearInterval(id);
  }, [hasAds]);
  const showing = adAtTick(tick, ads.length, hasVideos);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black [container-type:size] lg:aspect-auto lg:min-h-0 lg:flex-1 lg:portrait:aspect-video lg:portrait:flex-none">
      {hasVideos && (
        <iframe
          ref={player}
          src={youtubeEmbedUrl(videos)}
          title="Clinic videos"
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          tabIndex={-1}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[max(100cqh,calc(100cqw*9/16))] w-[max(100cqw,calc(100cqh*16/9))] -translate-x-1/2 -translate-y-1/2 border-0"
        />
      )}
      {ads.map((url, i) => (
        // Clinic artwork on the Cloudinary CDN: already sized for a TV when it was uploaded.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          className={`absolute inset-0 h-full w-full bg-black object-contain motion-safe:transition-opacity motion-safe:duration-500 ${showing === i ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
    </div>
  );
}

function ServingCard({ entry, isNew, size }: { entry: DisplayEntry; isNew: boolean; size: keyof typeof SERVING }) {
  const place = placeOf(entry);
  const { number, detail } = SERVING[size];
  return (
    <li className={`flex min-w-0 flex-col justify-center rounded-lg bg-brand-teal-dark p-[3vmin] ${isNew ? 'ring-[0.8vmin] ring-amber-300 motion-safe:animate-pulse' : ''}`}>
      <p className={`font-mono font-semibold leading-none ${number}`}>{entry.number}</p>
      {entry.name && <p className={`mt-[1.5vmin] truncate ${detail}`}>{entry.name}</p>}
      {place && <p className={`mt-[0.5vmin] truncate font-semibold ${detail}`}>{place}</p>}
    </li>
  );
}

/** Shown instead of the board while the clinic hasn't opened it to a signed-out screen. */
export function QueueDisplayOff() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-brand-navy p-8 text-center text-white">
      <h1 className="text-3xl font-extrabold tracking-tight">This screen isn’t turned on</h1>
      <p className="max-w-xl text-lg text-gray-300">
        To show the queue here without signing in, turn on “Let a waiting-room screen show the queue without signing in” in the clinic’s settings. Staff can{' '}
        <a href="/login" className="font-semibold text-white underline underline-offset-4">
          sign in
        </a>{' '}
        on this device instead.
      </p>
    </main>
  );
}
