/**
 * Client-side polling that backs off when nobody is looking. Every poll is a request that reads
 * the database, and a tab left open all day otherwise polls just as often as one in use.
 */

/** No keyboard, pointer or scroll input for this long counts as idle. */
export const IDLE_AFTER_MS = 5 * 60 * 1000;

let lastActivity = Date.now();
let tracking = false;

function trackActivity() {
  if (tracking) return;
  tracking = true;
  const mark = () => {
    lastActivity = Date.now();
  };
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']) {
    window.addEventListener(type, mark, { passive: true, capture: true });
  }
}

/**
 * Call `poll` every `activeMs` while the tab is visible and in use, every `idleMs` once nobody
 * has used the page for IDLE_AFTER_MS, never while the tab is hidden, and right away when the
 * tab becomes visible again. Returns a function that stops it.
 */
export function startVisiblePoll(
  poll: () => void,
  { activeMs, idleMs = activeMs }: { activeMs: number; idleMs?: number }
): () => void {
  trackActivity();
  let lastPoll = Date.now();
  const run = () => {
    lastPoll = Date.now();
    poll();
  };

  const interval = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const wait = Date.now() - lastActivity > IDLE_AFTER_MS ? idleMs : activeMs;
    // Half a tick of slack, so timer drift doesn't skip a whole tick.
    if (Date.now() - lastPoll >= wait - activeMs / 2) run();
  }, activeMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
