'use client';

import { useEffect, useRef, useState } from 'react';
import type { DisplayEntry, QueueDisplayData } from '@/lib/queue-display';
import { AD_MS, adAtTick, youtubeEmbedUrl } from '@/lib/queue-media';

/** A called number reaches the room within this; also how long a new number stays highlighted. */
const POLL_MS = 20_000;
const CLOCK_MS = 15_000;

const clockText = (at: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(at);
const dateText = (at: number, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(at);

/** Cards shrink as more doctors call at once, so six still fit beside the reconnecting line. */
const SERVING = {
  solo: { grid: '', number: 'text-[max(4rem,20vmin)]', detail: 'text-[max(1.5rem,5vmin)]' },
  pair: { grid: 'sm:grid-cols-2', number: 'text-[max(3rem,11vmin)]', detail: 'text-[max(1.125rem,3.2vmin)]' },
  dense: { grid: 'sm:grid-cols-2 lg:grid-cols-3', number: 'text-[max(2.5rem,8vmin)]', detail: 'text-[max(1rem,2.6vmin)]' },
};

/** Beside the videos the queue has a narrow column, so it shows the latest calls and the very next. */
const COMPACT_SERVING = 4;
const COMPACT_NEXT = 3;

const placeOf = (e: DisplayEntry) => [e.room, e.doctor].filter(Boolean).join(' · ');

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
  const [now, setNow] = useState(() => Date.now());
  const [lastGood, setLastGood] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const [switchedOff, setSwitchedOff] = useState(false);
  const served = useRef(initial.nowServing.map((e) => e.id));

  // Nobody is at this screen to refresh it, so it has to survive dropped Wi-Fi and a bad response
  // alone: keep the last board, say it may be out of date, and keep trying.
  useEffect(() => {
    let inFlight = false;
    const load = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const res = await fetch(`/api/queue/display/data${query ? `?${query}` : ''}`, { cache: 'no-store' });
        if (res.status === 403) {
          setSwitchedOff(true);
          return;
        }
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error);
        const next: QueueDisplayData = body.data;
        const ids = next.nowServing.map((e) => e.id);
        setFresh(ids.filter((id) => !served.current.includes(id)));
        served.current = ids;
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
    const poll = window.setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', load);
    };
  }, [query]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  if (switchedOff) return <QueueDisplayOff />;

  const more = data.waiting - data.nextUp.length;
  const called = data.nowServing.filter((e) => fresh.includes(e.id));
  const hasMedia = data.media.videos.length > 0 || data.media.ads.length > 0;
  const servingSize: keyof typeof SERVING = data.nowServing.length === 1 ? 'solo' : data.nowServing.length <= 4 ? 'pair' : 'dense';

  return (
    <main className="flex min-h-dvh flex-col gap-[3vmin] bg-brand-navy p-[4vmin] text-white lg:h-dvh lg:overflow-hidden">
      <header className="flex items-center justify-between gap-[4vmin]">
        <h1 className="min-w-0 truncate text-[max(1.5rem,4.5vmin)] font-extrabold tracking-tight">{clinicName}</h1>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[max(1.5rem,4.5vmin)] font-semibold leading-none" suppressHydrationWarning>
            {clockText(now, timeZone)}
          </p>
          <p className="mt-[0.8vmin] text-[max(0.875rem,2.2vmin)] text-gray-300" suppressHydrationWarning>
            {dateText(now, timeZone)}
          </p>
        </div>
      </header>

      {offline && (
        <p role="status" className="rounded-md bg-amber-300 px-[3vmin] py-[1.2vmin] text-[max(1rem,2.6vmin)] font-semibold text-gray-900">
          Reconnecting. This board was last updated at <span className="font-mono">{clockText(lastGood, timeZone)}</span>; please listen for your number.
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {called.length > 0 && `Now serving ${called.map((e) => e.number).join(', ')}`}
      </p>

      {hasMedia ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[3vmin] lg:grid-cols-[3fr_2fr] lg:portrait:grid-cols-1">
          <div className="flex min-h-0 flex-col gap-[2vmin]">
            <MediaSlot videos={data.media.videos} ads={data.media.ads} />
            {data.checkInImage && <CheckInCard image={data.checkInImage} />}
          </div>
          <div className="flex min-h-0 flex-col gap-[2vmin] overflow-hidden lg:portrait:order-first">
            <h2 className="text-[max(1.125rem,3vmin)] font-semibold text-gray-300">Now serving</h2>
            {data.nowServing.length === 0 ? (
              <p className="rounded-lg border border-white/15 p-[2.5vmin] text-[max(1rem,2.8vmin)] text-gray-300">
                {data.waiting > 0 ? 'The next number will be called shortly' : 'No one in line right now'}
              </p>
            ) : (
              <ul className="flex flex-col gap-[1.2vmin]">
                {data.nowServing.slice(0, COMPACT_SERVING).map((e) => (
                  <li
                    key={e.id}
                    className={`flex items-center gap-[2.5vmin] rounded-lg bg-brand-teal-dark px-[2.5vmin] py-[0.6vmin] ${fresh.includes(e.id) ? 'ring-[0.6vmin] ring-amber-300 motion-safe:animate-pulse' : ''}`}
                  >
                    <span className="shrink-0 font-mono text-[max(1.5rem,5.5vmin)] font-semibold leading-none">{e.number}</span>
                    <span className="min-w-0 text-[max(0.875rem,2.3vmin)] leading-snug">
                      <span className="block truncate">{e.name}</span>
                      {placeOf(e) && <span className="block truncate font-semibold">{placeOf(e)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="flex items-baseline justify-between gap-[2vmin] text-[max(1.125rem,3vmin)] font-semibold text-gray-300">
              Next up
              <span className="text-[max(0.875rem,2.4vmin)] font-medium">
                <span className="font-mono">{data.waiting}</span> waiting
              </span>
            </h2>
            {data.nextUp.length === 0 ? (
              <p className="text-[max(1rem,2.6vmin)] text-gray-300">No one is waiting.</p>
            ) : (
              <ol className="divide-y divide-white/15">
                {data.nextUp.slice(0, COMPACT_NEXT).map((e) => (
                  <li key={e.id} className="flex items-center gap-[2.5vmin] py-[0.7vmin]">
                    <span className="shrink-0 font-mono text-[max(1.125rem,3.6vmin)] font-semibold">{e.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[max(0.875rem,2.4vmin)]">{e.name}</span>
                    <span className="min-w-0 truncate text-[max(0.875rem,2.2vmin)] text-gray-300">{e.doctor}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
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
          <h2 id="next-title" className="flex items-baseline justify-between gap-[2vmin] text-[max(1.125rem,3vmin)] font-semibold text-gray-300">
            Next up
            <span className="text-[max(0.875rem,2.4vmin)] font-medium">
              <span className="font-mono">{data.waiting}</span> waiting
            </span>
          </h2>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-white/15 px-[2.5vmin]">
            {data.nextUp.length === 0 ? (
              <p className="py-[3vmin] text-[max(1rem,2.8vmin)] text-gray-300">No one is waiting.</p>
            ) : (
              <ol className="divide-y divide-white/15">
                {data.nextUp.map((e) => (
                  <li key={e.id} className="flex items-center gap-[3vmin] py-[1.5vmin]">
                    <span className="w-[16vmin] min-w-20 shrink-0 font-mono text-[max(1.25rem,4vmin)] font-semibold">{e.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[max(1rem,2.8vmin)]">{e.name}</span>
                    <span className="shrink-0 truncate text-[max(0.875rem,2.4vmin)] text-gray-300">{e.doctor}</span>
                  </li>
                ))}
              </ol>
            )}
            {more > 0 && (
              <p className="border-t border-white/15 py-[1.5vmin] text-[max(0.875rem,2.4vmin)] text-gray-300">
                and <span className="font-mono">{more}</span> more
              </p>
            )}
          </div>

          {data.checkInImage && <CheckInCard image={data.checkInImage} />}
        </section>
      </div>
      )}
    </main>
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
function MediaSlot({ videos, ads }: { videos: string[]; ads: string[] }) {
  const [tick, setTick] = useState(0);
  const hasAds = ads.length > 0;
  useEffect(() => {
    if (!hasAds) return;
    const id = window.setInterval(() => setTick((t) => t + 1), AD_MS);
    return () => window.clearInterval(id);
  }, [hasAds]);
  const showing = adAtTick(tick, ads.length, videos.length > 0);

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black [container-type:size] lg:aspect-auto lg:min-h-0 lg:flex-1 lg:portrait:aspect-video lg:portrait:flex-none">
      {videos.length > 0 && (
        <iframe
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
      <p className={`mt-[1.5vmin] truncate ${detail}`}>{entry.name}</p>
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
