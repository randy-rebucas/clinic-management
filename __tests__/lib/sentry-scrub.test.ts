import { describe, it, expect } from 'vitest';
import type { Breadcrumb, Event } from '@sentry/nextjs';
import {
  FILTERED,
  isSensitiveKey,
  parseSampleRate,
  redactText,
  scrubBreadcrumb,
  scrubEvent,
  scrubTransaction,
  sharedSentryOptions,
  stripQuery,
} from '@/lib/sentry-scrub';

describe('sentry-scrub', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'name', 'firstName', 'last_name', 'patientName', 'phone', 'phoneNumber', 'contactNumber', 'email',
      'diagnosis', 'diagnoses', 'notes', 'clinicalNotes', 'medications', 'dob', 'dateOfBirth', 'birthDate',
      'address', 'homeAddress', 'password', 'resetToken', 'Authorization', 'cookie', 'allergies', 'body',
    ])('flags %s', (key) => expect(isSensitiveKey(key)).toBe(true));

    it.each(['id', 'tenantId', 'status', 'routePath', 'method', 'digest', 'appointmentCode'])(
      'keeps %s',
      (key) => expect(isSensitiveKey(key)).toBe(false),
    );
  });

  describe('redactText', () => {
    it('redacts emails and PH mobile numbers', () => {
      const out = redactText('Failed to notify juan.dela.cruz@example.com at +63 917 123 4567 or 09171234567');
      expect(out).not.toContain('juan');
      expect(out).not.toContain('917');
      expect(out.match(new RegExp(FILTERED.replace(/[[\]]/g, '\\$&'), 'g'))).toHaveLength(3);
    });

    it('redacts values echoed by Mongo/Mongoose errors', () => {
      expect(redactText('E11000 duplicate key error collection: db.patients index: email_1 dup key: { email: "x" }'))
        .toBe(`E11000 duplicate key error collection: db.patients index: email_1 dup key: { ${FILTERED} }`);
      expect(redactText('Patient validation failed: lastName: Path `lastName` (`Santos`) is longer than allowed'))
        .not.toContain('Santos');
      expect(redactText('Cast to ObjectId failed for value "Maria Clara" (type string) at path "_id"'))
        .not.toContain('Maria');
    });

    it('leaves ordinary text alone', () => {
      expect(redactText('Cannot read properties of undefined (reading "x")')).toBe('Cannot read properties of undefined (reading "x")');
    });
  });

  it('stripQuery drops query strings and fragments', () => {
    expect(stripQuery('https://app.example/set-password?token=abc#x')).toBe('https://app.example/set-password');
    expect(stripQuery('/api/calendar/feed#t')).toBe('/api/calendar/feed');
    expect(stripQuery('/plain')).toBe('/plain');
  });

  describe('scrubEvent', () => {
    const makeEvent = (): Event => ({
      message: 'Lookup for ana@example.com failed',
      transaction: 'GET /appointments/confirm?token=secret',
      request: {
        method: 'POST',
        url: 'https://clinic.example/appointments/confirm?token=secret',
        query_string: 'token=secret',
        data: { firstName: 'Ana', diagnosis: 'flu' },
        cookies: { session: 'abc' },
        headers: { Authorization: 'Bearer x', Cookie: 'session=abc', 'User-Agent': 'UA', Referer: 'https://x/?t=1' },
        env: { REMOTE_ADDR: '1.2.3.4' },
      },
      user: { id: 'u1', email: 'ana@example.com', username: 'ana', ip_address: '1.2.3.4' },
      extra: {
        tenantId: 't1',
        patient: { firstName: 'Ana', lastName: 'Reyes', dateOfBirth: '1990-01-01', medications: ['x'] },
        nested: [{ phone: '09171234567', notes: 'private', visitId: 'v1' }],
      },
      contexts: {
        runtime: { name: 'node', version: 'v22' },
        nextjs: { request_path: '/api/x?token=1', route_type: 'route' },
        custom: { address: 'Manila', deep: { email: 'a@b.co', ok: 1 } },
      },
      tags: { tenant_id: 't1', email: 'a@b.co' },
      exception: {
        values: [{
          type: 'MongoServerError',
          value: 'E11000 duplicate key error dup key: { phone: "+639171234567" }',
          stacktrace: { frames: [{ filename: 'a.js', vars: { patient: 'Ana' } }] },
        }],
      },
      breadcrumbs: [
        { category: 'console', message: 'patient Ana Reyes' },
        { category: 'fetch', data: { method: 'POST', url: '/api/patients?q=Ana', status_code: 500, request_body: '{}' } },
      ],
    });

    it('removes request bodies, cookies, auth headers and query strings', () => {
      const event = scrubEvent(makeEvent());
      expect(event.request).toEqual({
        method: 'POST',
        url: 'https://clinic.example/appointments/confirm',
        headers: { 'User-Agent': 'UA' },
      });
      expect(event.transaction).toBe('GET /appointments/confirm');
    });

    it('reduces user data to an opaque id', () => {
      expect(scrubEvent(makeEvent()).user).toEqual({ id: 'u1' });
    });

    it('filters PHI keys recursively in extra, contexts and tags', () => {
      const event = scrubEvent(makeEvent());
      expect(event.extra).toEqual({
        tenantId: 't1',
        patient: { firstName: FILTERED, lastName: FILTERED, dateOfBirth: FILTERED, medications: FILTERED },
        nested: [{ phone: FILTERED, notes: FILTERED, visitId: 'v1' }],
      });
      expect(event.contexts?.custom).toEqual({ address: FILTERED, deep: { email: FILTERED, ok: 1 } });
      expect(event.contexts?.nextjs).toEqual({ request_path: '/api/x', route_type: 'route' });
      expect(event.contexts?.runtime).toEqual({ name: 'node', version: 'v22' });
      expect(event.tags).toEqual({ tenant_id: 't1', email: FILTERED });
    });

    it('redacts exception values and messages and drops frame vars', () => {
      const event = scrubEvent(makeEvent());
      const ex = event.exception!.values![0];
      expect(ex.value).not.toContain('917');
      expect(ex.stacktrace!.frames![0].vars).toBeUndefined();
      expect(event.message).not.toContain('ana@');
    });

    it('drops console breadcrumbs and network bodies', () => {
      const event = scrubEvent(makeEvent());
      expect(event.breadcrumbs).toEqual([
        { category: 'fetch', data: { method: 'POST', url: '/api/patients', status_code: 500 } },
      ]);
    });
  });

  describe('scrubBreadcrumb', () => {
    it('strips queries from navigation breadcrumbs', () => {
      const crumb: Breadcrumb = { category: 'navigation', data: { from: '/a?x=1', to: '/set-password?token=t' } };
      expect(scrubBreadcrumb(crumb)?.data).toEqual({ from: '/a', to: '/set-password' });
    });

    it('drops input breadcrumbs and attribute values from click selectors', () => {
      expect(scrubBreadcrumb({ category: 'ui.input', message: 'input[name="phone"]' })).toBeNull();
      expect(scrubBreadcrumb({ category: 'ui.click', message: 'div.row > span[title="Ana Reyes"]' })?.message)
        .toBe('div.row > span');
    });

    it('drops xhr payloads', () => {
      const out = scrubBreadcrumb({ category: 'xhr', data: { method: 'PUT', url: '/api/x?t=1', status_code: 200, body: 'x' } });
      expect(out?.data).toEqual({ method: 'PUT', url: '/api/x', status_code: 200 });
    });
  });

  it('scrubTransaction removes DB statements and query strings from spans', () => {
    const event = scrubTransaction({
      type: 'transaction',
      transaction: '/patients?search=Ana',
      contexts: { trace: { trace_id: 't', span_id: 's', data: { 'url.query': 'search=Ana', 'http.route': '/patients' } } },
      spans: [{
        span_id: 's1', trace_id: 't', start_timestamp: 0,
        description: 'GET https://api.example/v1?key=secret',
        data: { 'db.statement': '{"name":"Ana"}', 'http.url': 'https://api.example/v1?key=secret', 'http.method': 'GET' },
      }],
    } as unknown as Event);
    expect(event.transaction).toBe('/patients');
    expect(event.contexts?.trace?.data).toEqual({ 'http.route': '/patients' });
    expect(event.spans![0].description).toBe('GET https://api.example/v1');
    expect(event.spans![0].data).toEqual({ 'http.url': 'https://api.example/v1', 'http.method': 'GET' });
  });

  it('parseSampleRate accepts 0..1 and falls back otherwise', () => {
    expect(parseSampleRate(undefined)).toBe(0.1);
    expect(parseSampleRate('')).toBe(0.1);
    expect(parseSampleRate('0.25')).toBe(0.25);
    expect(parseSampleRate('0')).toBe(0);
    expect(parseSampleRate('2')).toBe(0.1);
    expect(parseSampleRate('abc')).toBe(0.1);
  });

  it('sharedSentryOptions disables default PII and only sets release when provided', () => {
    const opts = sharedSentryOptions({ dsn: 'https://k@o1.ingest.sentry.io/1', environment: 'production' });
    expect(opts.sendDefaultPii).toBe(false);
    expect(opts.tracesSampleRate).toBe(0.1);
    expect('release' in opts).toBe(false);
    expect(sharedSentryOptions({ dsn: 'x', release: 'abc' }).release).toBe('abc');
  });
});
