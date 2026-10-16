import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { parseBody, isValidationError, asString, escapeRegex, roundMoney, zObjectId } from '@/lib/api/validate';

const jsonRequest = (body: string) =>
  new NextRequest('http://localhost/api/x', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });

const schema = z.object({ name: z.string(), age: z.number().optional() });

describe('parseBody', () => {
  it('strips unknown keys (mass-assignment guard)', async () => {
    const res = await parseBody(
      jsonRequest(JSON.stringify({ name: 'Ana', tenantId: 'evil', role: 'admin', password: 'x' })),
      schema
    );
    expect(isValidationError(res)).toBe(false);
    if (isValidationError(res)) return;
    expect(res.data).toEqual({ name: 'Ana' });
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await parseBody(jsonRequest('{not json'), schema);
    expect(isValidationError(res)).toBe(true);
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).json()).toMatchObject({ success: false, error: 'Invalid JSON body' });
  });

  it('rejects schema violations with 400 and issue paths', async () => {
    const res = await parseBody(jsonRequest(JSON.stringify({ name: 5 })), schema);
    expect((res as Response).status).toBe(400);
    const body = await (res as Response).json();
    expect(body.issues[0].path).toBe('name');
  });

  it('rejects operator objects where an id is expected', async () => {
    const res = await parseBody(jsonRequest(JSON.stringify({ id: { $ne: null } })), z.object({ id: zObjectId }));
    expect(isValidationError(res)).toBe(true);
  });
});

describe('asString', () => {
  it('passes strings and rejects everything else', () => {
    expect(asString('abc')).toBe('abc');
    expect(asString({ $ne: null })).toBeNull();
    expect(asString(['a'])).toBeNull();
    expect(asString(1)).toBeNull();
    expect(asString(undefined)).toBeNull();
  });
});

describe('escapeRegex', () => {
  it('escapes regex metacharacters so input matches literally', () => {
    const raw = 'a.*+?^${}()|[]\\b';
    const escaped = escapeRegex(raw);
    expect(new RegExp(`^${escaped}$`).test(raw)).toBe(true);
    expect(new RegExp(escapeRegex('.*')).test('abc')).toBe(false);
  });
});

describe('roundMoney', () => {
  it('rounds to centavos', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
