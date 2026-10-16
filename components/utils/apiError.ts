interface ApiErrorBody {
  error?: unknown;
  issues?: Array<{ path?: unknown; message?: unknown }>;
}

/**
 * Human-readable message from an API error body, including zod validation `issues`
 * (`{ success:false, error, issues:[{ path, message }] }`) when present.
 */
export function formatApiError(data: unknown, fallback: string): string {
  const body = (data && typeof data === 'object' ? data : {}) as ApiErrorBody;
  const base = typeof body.error === 'string' && body.error ? body.error : fallback;
  if (!Array.isArray(body.issues) || body.issues.length === 0) return base;
  const details = body.issues
    .filter((i) => i && typeof i.message === 'string')
    .map((i) => {
      const path = Array.isArray(i.path) ? i.path.join('.') : typeof i.path === 'string' ? i.path : '';
      return path ? `${path}: ${i.message}` : String(i.message);
    });
  return details.length ? `${base} — ${details.join('; ')}` : base;
}
