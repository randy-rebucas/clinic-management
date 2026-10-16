// Reading and writing a lab result's values: results / referenceRanges / abnormalFlags maps.

export type Flag = 'high' | 'low' | 'normal';
export type ValueMap = Record<string, string | number | boolean | null>;

export interface EarlierResult {
  _id: string;
  requestCode?: string;
  orderDate?: string;
  resultDate?: string;
  results?: ValueMap;
  abnormalFlags?: Record<string, string>;
}

/** "whiteBloodCells" → "White blood cells"; names typed with spaces are left as written. */
export function analyteLabel(key: string) {
  if (/\s/.test(key) || key.length <= 4) return key.length <= 4 && key === key.toLowerCase() ? key.toUpperCase() : key;
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** First number in a value such as "13.2", "13.2 g/dL" or 13.2. */
export function numberIn(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
  return m ? Number(m[0]) : null;
}

/** Bounds from "12-16 g/dL", "12 – 16", "<5", "> 40", "≤200". Null when nothing numeric is found. */
export function parseRange(range: unknown): { low: number | null; high: number | null } | null {
  if (typeof range !== 'string' || !range.trim()) return null;
  const r = range.replace(/,/g, '').trim();
  const between = /(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const below = /^(?:<|≤|<=|up to)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (below) return { low: null, high: Number(below[1]) };
  const above = /^(?:>|≥|>=)\s*(-?\d+(?:\.\d+)?)/i.exec(r);
  if (above) return { low: Number(above[1]), high: null };
  return null;
}

/** The flag a value earns against its range, or null when either can't be read as numbers. */
export function flagFor(value: unknown, range: unknown): Flag | null {
  const v = numberIn(value);
  const b = parseRange(range);
  if (v === null || !b) return null;
  if (b.low !== null && v < b.low) return 'low';
  if (b.high !== null && v > b.high) return 'high';
  return 'normal';
}

export interface ResultRow {
  _key: string;
  name: string;
  value: string;
  range: string;
  flag: '' | Flag;
}

/** yyyy-MM-dd in the viewer's own time zone. */
export function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let seq = 0;
export const rowKey = () => `a${++seq}`;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Rows for the editor: this result's values, or (when none yet) the names and ranges from the patient's last result. */
export function rowsFrom(results?: ValueMap | null, ranges?: Record<string, unknown> | null, flags?: Record<string, string> | null, previous?: EarlierResult | null): ResultRow[] {
  const keys = Object.keys(results ?? {});
  if (keys.length) {
    return keys.map((k) => ({
      _key: rowKey(),
      name: k,
      value: text(results?.[k]),
      range: text(ranges?.[k]),
      flag: flags?.[k] === 'high' || flags?.[k] === 'low' || flags?.[k] === 'normal' ? (flags[k] as Flag) : '',
    }));
  }
  const prevKeys = Object.keys(previous?.results ?? {});
  if (prevKeys.length) return prevKeys.map((k) => ({ _key: rowKey(), name: k, value: '', range: text(ranges?.[k]), flag: '' }));
  return [{ _key: rowKey(), name: '', value: '', range: '', flag: '' }];
}

/** Numbers stay numbers so later results can be compared; anything else is kept as written. */
const stored = (v: string) => (/^-?\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : v.trim());

export function payloadFrom(rows: ResultRow[]) {
  const results: ValueMap = {};
  const referenceRanges: ValueMap = {};
  const abnormalFlags: Record<string, Flag> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (!name || !r.value.trim()) continue;
    results[name] = stored(r.value);
    if (r.range.trim()) referenceRanges[name] = r.range.trim();
    if (r.flag) abnormalFlags[name] = r.flag;
  }
  return { results, referenceRanges, abnormalFlags };
}

export function rowProblems(rows: ResultRow[]) {
  const out: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const r of rows) {
    const name = r.name.trim();
    if (!name && (r.value.trim() || r.range.trim())) out[r._key] = 'Name the test, or remove this row.';
    else if (name && /^\$|\./.test(name)) out[r._key] = 'Leave out full stops and a leading $ (e.g. “Vit D”, not “Vit. D”).';
    else if (name) {
      const k = name.toLowerCase();
      if (seen.has(k)) out[r._key] = `${name} is already listed above.`;
      else seen.set(k, r._key);
    }
  }
  return out;
}

/** The value of the same test in the newest earlier result that has it. */
export function previousValue(history: EarlierResult[], key: string): { value: string | number; date?: string; flag?: string } | null {
  const lower = key.toLowerCase();
  for (const h of history) {
    const match = Object.keys(h.results ?? {}).find((k) => k.toLowerCase() === lower);
    if (match !== undefined) {
      const v = h.results![match];
      if (v === null || v === undefined || v === '') continue;
      return { value: typeof v === 'boolean' ? String(v) : v, date: h.resultDate ?? h.orderDate, flag: h.abnormalFlags?.[match] };
    }
  }
  return null;
}
