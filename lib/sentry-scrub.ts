import type { Breadcrumb, Event } from '@sentry/nextjs';

/**
 * PHI/PII scrubbing for Sentry events (Philippine Data Privacy Act).
 *
 * Everything that leaves the process through Sentry passes through these functions:
 * request bodies, cookies, headers and query strings are dropped, user data is reduced to an
 * opaque id, PHI-ish keys are filtered recursively, and emails / PH mobile numbers / values
 * echoed in database error messages are redacted from free text.
 */

export const FILTERED = '[Filtered]';

const SENSITIVE_KEY_EXACT = new Set([
  'name', 'firstname', 'lastname', 'middlename', 'fullname', 'givenname', 'familyname', 'maidenname',
  'nickname', 'displayname', 'username', 'patientname', 'doctorname', 'guardianname', 'suffix',
  'dob', 'age', 'sex', 'gender', 'ssn', 'tin', 'body', 'data', 'cookies', 'query', 'querystring',
  'requestbody', 'responsebody', 'ip', 'ipaddress',
]);

const SENSITIVE_KEY_PARTS = [
  'phone', 'mobile', 'email', 'diagnos', 'note', 'medication', 'medicine', 'prescription', 'allerg',
  'symptom', 'complaint', 'address', 'birth', 'password', 'passwd', 'token', 'secret', 'cookie',
  'authorization', 'apikey', 'otp', 'philhealth', 'insurance', 'contact', 'vital', 'labresult',
  'history', 'treatment', 'condition', 'remarks', 'comment', 'statement',
];

// SDK-generated contexts that never carry request or patient data.
const SAFE_CONTEXTS = new Set(['runtime', 'os', 'browser', 'device', 'app', 'culture', 'cloud_resource']);

const MAX_DEPTH = 8;

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  const k = normalizeKey(key);
  if (!k) return false;
  if (SENSITIVE_KEY_EXACT.has(k)) return true;
  return SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Philippine mobile numbers: +63 9xx..., 63 9xx..., 09xx...
const PH_MOBILE_RE = /(?:\+?63|\b0)[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g;
// Mongo duplicate-key errors echo the colliding value: `dup key: { email: "a@b.c" }`.
const DUP_KEY_RE = /dup key: \{[^}]*\}/g;
// Mongoose validation / cast errors echo the rejected value.
const MONGOOSE_PATH_VALUE_RE = /(Path `[^`]*` )\(`[^`]*`\)/g;
const CAST_VALUE_RE = /(for value )(".*?"|'.*?'|`.*?`|\{.*?\})( \(type)/g;

export function redactText(text: string): string {
  return text
    .replace(DUP_KEY_RE, `dup key: { ${FILTERED} }`)
    .replace(MONGOOSE_PATH_VALUE_RE, `$1(\`${FILTERED}\`)`)
    .replace(CAST_VALUE_RE, `$1"${FILTERED}"$3`)
    .replace(EMAIL_RE, FILTERED)
    .replace(PH_MOBILE_RE, FILTERED);
}

/** Drops the query string and fragment (they can carry set-password, confirm and calendar-feed tokens). */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function isUrlKey(key: string): boolean {
  const k = normalizeKey(key);
  return k === 'url' || k === 'from' || k === 'to' || k.endsWith('url') || k.endsWith('path') || k === 'httptarget' || k === 'urlfull';
}

/** Recursively filters PHI-ish keys and redacts free text. Returns a new value; never mutates. */
export function scrubValue(value: unknown, depth = 0, key = ''): unknown {
  if (typeof value === 'string') {
    return redactText(key && isUrlKey(key) ? stripQuery(value) : value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return FILTERED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1, key));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? FILTERED : scrubValue(v, depth + 1, k);
  }
  return out;
}

function scrubRecord<T>(record: T | undefined): T | undefined {
  return record ? (scrubValue(record) as T) : record;
}

const DROPPED_SPAN_KEYS = new Set([
  'db.statement', 'db.query.text', 'db.mongodb.query', 'db.query.summary',
  'http.query', 'url.query', 'http.fragment', 'url.fragment',
  'http.request.body', 'http.response.body',
]);

/** Span attributes: drop DB statements and query strings, strip queries from URL-ish attributes. */
export function scrubSpanData(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (DROPPED_SPAN_KEYS.has(k)) continue;
    if (typeof v === 'string') {
      out[k] = redactText(/url|target|path|route/i.test(k) ? stripQuery(v) : v);
    } else if (v !== null && typeof v === 'object') {
      out[k] = scrubValue(v, 1, k);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function scrubContexts(contexts: Event['contexts']): Event['contexts'] {
  if (!contexts) return contexts;
  const out: Record<string, unknown> = {};
  for (const [name, ctx] of Object.entries(contexts)) {
    if (SAFE_CONTEXTS.has(name) || !ctx) {
      out[name] = ctx;
    } else if (name === 'trace') {
      const trace = ctx as Record<string, unknown>;
      out[name] = { ...trace, data: scrubSpanData(trace.data as Record<string, unknown> | undefined) };
    } else {
      out[name] = scrubValue(ctx);
    }
  }
  return out as Event['contexts'];
}

const KEPT_HEADERS = new Set(['user-agent', 'content-type', 'content-length']);

function scrubRequest(request: Event['request']): Event['request'] {
  if (!request) return request;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(request.headers ?? {})) {
    if (KEPT_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  return {
    method: request.method,
    url: request.url ? stripQuery(request.url) : undefined,
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

function scrubUser(user: Event['user']): Event['user'] {
  if (!user) return user;
  const id = user.id;
  return id !== undefined && id !== null && id !== '' ? { id: String(id) } : undefined;
}

function scrubCommon<T extends Event>(event: T): T {
  event.request = scrubRequest(event.request);
  event.user = scrubUser(event.user);
  event.extra = scrubRecord(event.extra);
  event.contexts = scrubContexts(event.contexts);
  event.tags = scrubRecord(event.tags);
  if (event.transaction) event.transaction = stripQuery(event.transaction);
  if (event.message) event.message = redactText(event.message);
  if (event.logentry) {
    event.logentry = {
      ...event.logentry,
      message: event.logentry.message ? redactText(event.logentry.message) : event.logentry.message,
      params: undefined,
    };
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb))
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }
  return event;
}

export function scrubEvent<T extends Event>(event: T): T {
  scrubCommon(event);
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
    }
  }
  return event;
}

export function scrubTransaction<T extends Event>(event: T): T {
  scrubCommon(event);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = redactText(stripQuery(span.description));
    if (span.data) span.data = scrubSpanData(span.data) as typeof span.data;
  }
  return event;
}

const DROPPED_CATEGORIES = new Set(['console', 'ui.input', 'sentry.event', 'sentry.transaction']);
const NETWORK_CATEGORIES = new Set(['fetch', 'xhr', 'http']);

/** Returns null to drop the breadcrumb. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  const category = crumb.category ?? '';
  // Console output can include anything the app logs, including patient records.
  if (DROPPED_CATEGORIES.has(category)) return null;

  if (NETWORK_CATEGORIES.has(category)) {
    const d = crumb.data ?? {};
    return {
      ...crumb,
      message: crumb.message ? redactText(stripQuery(crumb.message)) : crumb.message,
      data: {
        method: d.method,
        status_code: d.status_code,
        url: typeof d.url === 'string' ? stripQuery(d.url) : undefined,
      },
    };
  }

  if (category === 'navigation') {
    const d = crumb.data ?? {};
    return {
      ...crumb,
      data: {
        from: typeof d.from === 'string' ? stripQuery(d.from) : undefined,
        to: typeof d.to === 'string' ? stripQuery(d.to) : undefined,
      },
    };
  }

  let message = crumb.message;
  if (message) {
    // DOM selectors can include attribute values such as title="<patient name>".
    if (category.startsWith('ui.')) message = message.replace(/\[[^\]]*\]/g, '');
    message = redactText(message);
  }
  return { ...crumb, message, data: scrubRecord(crumb.data) };
}

export function parseSampleRate(raw: string | undefined, fallback = 0.1): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/** Options shared by the server, edge and browser SDKs. */
export function sharedSentryOptions(opts: {
  dsn: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: string;
}) {
  return {
    dsn: opts.dsn,
    environment: opts.environment,
    ...(opts.release ? { release: opts.release } : {}),
    sendDefaultPii: false,
    tracesSampleRate: parseSampleRate(opts.tracesSampleRate),
    maxBreadcrumbs: 50,
    beforeSend: <T extends Event>(event: T) => scrubEvent(event),
    beforeSendTransaction: <T extends Event>(event: T) => scrubTransaction(event),
    beforeBreadcrumb: (crumb: Breadcrumb) => scrubBreadcrumb(crumb),
  };
}
