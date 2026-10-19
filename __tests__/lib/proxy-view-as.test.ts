import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { proxy } from '@/proxy';

const key = new TextEncoder().encode('any-key-the-proxy-only-decodes');

async function token(claims: Record<string, unknown>) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(key);
}

function request(method: string, path: string, opts: { cookie?: string; bearer?: string } = {}) {
  const headers = new Headers({ host: 'clinic.localhost:3000', origin: 'http://clinic.localhost:3000' });
  if (opts.cookie) headers.set('cookie', `session=${opts.cookie}`);
  if (opts.bearer) headers.set('authorization', `Bearer ${opts.bearer}`);
  return new NextRequest(`http://clinic.localhost:3000${path}`, { method, headers });
}

describe('proxy: view-as sessions are read-only', () => {
  it('refuses API writes, server actions and bearer writes under a view-as session', async () => {
    const imp = await token({ userId: 'u', imp: 'ops@myclinicsoft.test' });
    for (const req of [
      request('POST', '/api/patients', { cookie: imp }),
      request('DELETE', '/api/rooms/1', { cookie: imp }),
      request('POST', '/patients', { cookie: imp }),
      request('PATCH', '/api/settings', { bearer: imp }),
    ]) {
      const res = proxy(req);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Read-only/);
    }
  });

  it('lets reads through under a view-as session', async () => {
    const imp = await token({ userId: 'u', imp: 'ops@myclinicsoft.test' });
    expect(proxy(request('GET', '/api/patients', { cookie: imp })).status).toBe(200);
    expect(proxy(request('GET', '/api/platform/view-as/exit', { cookie: imp })).status).toBe(200);
  });

  it('does not touch ordinary staff sessions', async () => {
    const staff = await token({ userId: 'u' });
    expect(proxy(request('POST', '/api/patients', { cookie: staff })).status).toBe(200);
    expect(proxy(request('POST', '/api/patients', { cookie: 'not-a-jwt' })).status).toBe(200);
  });
});
