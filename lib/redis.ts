/**
 * Upstash Redis over its REST API (plain fetch, works in every runtime).
 * Configured by UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or by the KV_REST_API_URL and
 * KV_REST_API_TOKEN that Vercel's Upstash integration sets. When unset, or Redis is unreachable,
 * calls return null and callers fall back to their own path.
 */

/** The REST URL and read-write token, whichever naming is set (the read-only token can't write). */
export function redisRestEnv(): { url?: string; token?: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  };
}

function upstashConfig(): { url: string; token: string } | null {
  const { url, token } = redisRestEnv();
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

/** Run commands in one round trip. Null when Redis isn't configured or the call failed. */
export async function redisPipeline(commands: (string | number)[][]): Promise<{ result?: unknown; error?: string }[] | null> {
  const cfg = upstashConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    return (await res.json()) as { result?: unknown; error?: string }[];
  } catch {
    return null;
  }
}
