import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import {
  memberTenantIds,
  parsePagination,
  resolveTenantFilter,
  scopedTenantIds,
  sessionTenantId,
  tenantScopeFilter,
} from '@/app/api/patients/me/_lib/patient-scope';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439022';
const C = '507f1f77bcf86cd799439033';
const oid = (s: string) => new Types.ObjectId(s);

describe('patient clinic scope', () => {
  it('reads tid only when it is a valid ObjectId string', () => {
    expect(sessionTenantId({ tid: A })).toBe(A);
    expect(sessionTenantId({ tid: 'nope' })).toBeUndefined();
    expect(sessionTenantId({})).toBeUndefined();
    expect(sessionTenantId(null)).toBeUndefined();
  });

  it("without tid: the patient's clinics, or unrestricted for a legacy patient", () => {
    expect(scopedTenantIds([A, B], {})).toEqual([A, B]);
    expect(scopedTenantIds([], {})).toBeNull();
    expect(tenantScopeFilter([], {})).toEqual({});
  });

  it("with tid: intersects the patient's clinics with the session's clinic (keeping stored values)", () => {
    const stored = [oid(A), oid(B)];
    const scope = scopedTenantIds(stored, { tid: B });
    expect(scope).toEqual([stored[1]]);
    expect(scope![0]).toBe(stored[1]);
    expect(tenantScopeFilter(stored, { tid: B })).toEqual({ tenantId: { $in: [stored[1]] } });
  });

  it("with tid outside the patient's clinics: nothing in scope (matches no records)", () => {
    expect(scopedTenantIds([A], { tid: C })).toEqual([]);
    expect(tenantScopeFilter([A], { tid: C })).toEqual({ tenantId: { $in: [] } });
  });

  it('with tid and a legacy patient (no clinic list): the session clinic only', () => {
    expect(scopedTenantIds([], { tid: C })!.map(String)).toEqual([C]);
  });

  it('memberTenantIds is strict: never unrestricted, never adds the session clinic', () => {
    expect(memberTenantIds([], {})).toEqual([]);
    expect(memberTenantIds([], { tid: C })).toEqual([]);
    expect(memberTenantIds([A, B], { tid: A })).toEqual([A]);
    expect(memberTenantIds([A, B], {})).toEqual([A, B]);
  });
});

describe('resolveTenantFilter (tenantId query param)', () => {
  it('no param: the whole scope', () => {
    const r = resolveTenantFilter([A, B], {}, null);
    expect(r.ok && r.filter).toEqual({ tenantId: { $in: [A, B] } });
  });

  it('malformed tenantId → 400', async () => {
    for (const bad of ['xyz', '123', 'aaaaaaaaaaaa', `${A}0`]) {
      const r = resolveTenantFilter([A], {}, bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(400);
    }
  });

  it('tenantId outside the patient clinics → 403', () => {
    const r = resolveTenantFilter([A], {}, B);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("tenantId of the patient's other clinic, on a session bound to one clinic → 403", () => {
    const r = resolveTenantFilter([A, B], { tid: A }, B);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it('tenantId inside scope narrows to that clinic', () => {
    const r = resolveTenantFilter([A, B], {}, B);
    expect(r.ok && r.filter).toEqual({ tenantId: B });
    const bound = resolveTenantFilter([A, B], { tid: B }, B);
    expect(bound.ok && bound.filter).toEqual({ tenantId: B });
  });

  it('legacy unrestricted patient: a valid tenantId narrows (as before)', () => {
    const r = resolveTenantFilter([], {}, A);
    expect(r.ok && String((r.filter as any).tenantId)).toBe(A);
  });
});

describe('parsePagination', () => {
  const parse = (qs: string, defaultLimit = 10, maxLimit = 50) =>
    parsePagination(new URLSearchParams(qs), { defaultLimit, maxLimit });

  it('defaults', () => {
    expect(parse('')).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it('non-numeric values fall back instead of NaN', () => {
    expect(parse('page=abc&limit=xyz')).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it('clamps out-of-range values', () => {
    expect(parse('page=-3&limit=0')).toEqual({ page: 1, limit: 10, skip: 0 });
    expect(parse('page=2&limit=9999')).toEqual({ page: 2, limit: 50, skip: 50 });
    expect(parse('page=99999999').page).toBe(10000);
  });

  it('parses normal values', () => {
    expect(parse('page=3&limit=20', 20, 50)).toEqual({ page: 3, limit: 20, skip: 40 });
  });
});
