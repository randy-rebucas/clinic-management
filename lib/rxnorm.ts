/**
 * RxNorm drug names from the free NLM RxNav API (no key; subject to the RxNav Terms of Service).
 * RxNorm is a US vocabulary: generic names match well, Philippine brand names often don't,
 * so it only supplements the clinic's own catalogue.
 *
 * The full display-name list (~750 KB) is fetched once and filtered locally, so typing never
 * sends a request per keystroke.
 */

const BASE_URL = (process.env.RXNAV_API_URL || 'https://rxnav.nlm.nih.gov/REST').replace(/\/$/, '');
const TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

// `lower` mirrors `terms` for case-insensitive matching (RxNorm has names like "HydroCHLOROthiazide").
type Names = { terms: string[]; lower: string[] };

let cache: (Names & { at: number }) | null = null;
let inFlight: Promise<Names> | null = null;

const EMPTY: Names = { terms: [], lower: [] };

async function loadDisplayNames(): Promise<Names> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  inFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/displaynames.json`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: TTL_MS / 1000 },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const terms: string[] = data?.displayTermsList?.term ?? [];
      cache = { terms, lower: terms.map((t) => t.toLowerCase()), at: Date.now() };
      return cache;
    } catch (error) {
      console.error('RxNorm display names unavailable:', error);
      // Serve a stale list if we have one; otherwise suggest nothing.
      return cache ?? EMPTY;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** RxNorm names matching `query`: names starting with it first, then names with a word starting with it. */
export async function searchRxNormNames(query: string, limit = 10): Promise<string[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];

  const { terms, lower } = await loadDisplayNames();
  const prefix: string[] = [];
  const wordStart: string[] = [];
  lower.forEach((term, i) => {
    if (term.startsWith(q)) prefix.push(terms[i]);
    else if (wordStart.length < limit && term.includes(` ${q}`)) wordStart.push(terms[i]);
  });

  return [...prefix.sort((a, b) => a.length - b.length || a.localeCompare(b)), ...wordStart]
    .slice(0, limit)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1));
}
