/**
 * What a clinic plays on its waiting-room screen beside the queue: YouTube videos and its own
 * ad images. No server imports, so the settings form, the API and the screen all share this.
 */

export const MAX_DISPLAY_VIDEOS = 20;
export const MAX_DISPLAY_ADS = 10;
export const MAX_DISPLAY_TICKER = 200;

/** How much of a patient's name the public screen shows. */
export const DISPLAY_NAME_STYLES = ['first-initial', 'initials', 'number'] as const;
export type DisplayNameStyle = (typeof DISPLAY_NAME_STYLES)[number];
export const DISPLAY_NAME_LABELS: Record<DisplayNameStyle, string> = {
  'first-initial': 'First name and last initial (Juan D.)',
  initials: 'Initials (J. D.)',
  number: 'Queue number only',
};

/** Spelled out so a voice reads "W 0 5 2", not "W minus fifty-two". Never says a name: a room hears this. */
export function spokenCall({ number, room }: { number: string; room: string | null }): string {
  const said = number.replace(/[^a-z0-9]/gi, '').split('').join(' ');
  const place = room ? `, please go to ${/^\d/.test(room) ? `room ${room}` : room}` : '';
  return `Now serving ${said}${place}`;
}

/** The wait beside a patient's number. A rough guide, so it never reads as a promise. */
export function waitText(minutes: number) {
  if (minutes <= 0) return 'Next';
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `~${hours} hr ${rest} min` : `~${hours} hr`;
}

export const YOUTUBE_ID = /^[\w-]{11}$/;
/** Ads are only ever images we uploaded: the screen's CSP allows nothing else. */
export const AD_IMAGE_URL = /^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\/\S+$/;

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com']);

/** The video id in anything people paste: a watch, share, Shorts, live or embed link, or the id. */
export function youtubeId(input: string): string | null {
  const text = input.trim();
  if (YOUTUBE_ID.test(text)) return text;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined;
  if (host === 'youtu.be') id = path[0];
  else if (YOUTUBE_HOSTS.has(host)) id = path[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts', 'live', 'v'].includes(path[0]) ? path[1] : null;
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/**
 * One looping player for the whole list. Muted, because browsers refuse to autoplay sound, and
 * from the no-cookie host so a public screen sets no YouTube cookies until a video is played.
 */
/** Where the player runs, and so where the screen sends it mute and unmute. */
export const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';

/** Starts muted because browsers refuse to autoplay with sound; the screen unmutes it after a tap. */
export function youtubeEmbedUrl(ids: string[]): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    enablejsapi: '1',
    loop: '1',
    playlist: ids.join(','),
    controls: '0',
    disablekb: '1',
    fs: '0',
    rel: '0',
    iv_load_policy: '3',
    playsinline: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${ids[0]}?${params}`;
}

/** With videos on, an ad covers the player for one AD_MS in every AD_EVERY; alone, ads just rotate. */
export const AD_MS = 10_000;
export const AD_EVERY = 6;

/** Which ad shows at this tick of AD_MS, or null while the video has the screen. */
export function adAtTick(tick: number, adCount: number, hasVideos: boolean): number | null {
  if (adCount === 0) return null;
  if (!hasVideos) return tick % adCount;
  return tick % AD_EVERY === AD_EVERY - 1 ? Math.floor(tick / AD_EVERY) % adCount : null;
}
