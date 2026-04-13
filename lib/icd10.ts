/**
 * ICD-10-CM search using the free NLM ClinicalTables API.
 * No API key or registration required.
 * Docs: https://clinicaltables.nlm.nih.gov/apidoc/icd10cm/v3/doc.html
 */

export interface ICD10Result {
  code: string;
  description: string;
}

/**
 * Search ICD-10-CM codes by free-text query.
 * Returns up to `maxResults` matching codes (default 10, max 50).
 */
export async function searchICD10(
  query: string,
  maxResults = 10
): Promise<ICD10Result[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = Math.min(50, Math.max(1, maxResults));
  const url = new URL('https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search');
  url.searchParams.set('sf', 'code,name');
  url.searchParams.set('terms', trimmed);
  url.searchParams.set('maxList', String(limit));

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    // Response format: [totalCount, codes[], null, [[code, description], ...]]
    const data: [number, string[], null, [string, string][]] = await res.json();
    const items = data[3] ?? [];
    return items.map(([code, description]) => ({ code, description }));
  } catch {
    return [];
  }
}
