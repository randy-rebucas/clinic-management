import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/app/lib/dal', () => ({ deleteSession: vi.fn(), revokeSessionToken: vi.fn(async () => undefined), revokeUserSessions: vi.fn() }));
vi.mock('@/app/lib/refresh-tokens', () => ({
  findRefreshTokenSubject: vi.fn(),
  readRefreshTokenFromBody: vi.fn(),
  revokeRefreshToken: vi.fn(),
}));
vi.mock('@/models/MedicalRepresentative', () => ({ default: { findOne: vi.fn() } }));
vi.mock('@/models/MobileDevice', () => ({ default: { updateOne: vi.fn() } }));
vi.mock('@/app/api/medical-representatives/_lib/rep-session', () => ({
  requireRepSession: vi.fn(),
  isRepSessionError: (r: unknown) => r instanceof NextResponse,
  repProfileFilter: vi.fn(),
  REP_PRIVATE_FIELDS: '',
}));

import { Types } from 'mongoose';
import { revokeUserSessions } from '@/app/lib/dal';
import { readRefreshTokenFromBody, revokeRefreshToken, findRefreshTokenSubject } from '@/app/lib/refresh-tokens';
import MobileDevice from '@/models/MobileDevice';
import { requireRepSession } from '@/app/api/medical-representatives/_lib/rep-session';
import { DELETE } from '@/app/api/medical-representatives/session/route';

const USER = '507f1f77bcf86cd7994390aa';
const signOut = (query = '') => DELETE(new NextRequest(`http://x/api/medical-representatives/session${query}`, { method: 'DELETE' }));
const expired = () => vi.mocked(requireRepSession).mockResolvedValue(NextResponse.json({ success: false }, { status: 401 }) as any);

describe('DELETE /api/medical-representatives/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readRefreshTokenFromBody).mockResolvedValue('rt');
    vi.mocked(findRefreshTokenSubject).mockResolvedValue(null as any);
    vi.mocked(requireRepSession).mockResolvedValue({ userObjectId: new Types.ObjectId(USER), session: { userId: USER } } as any);
  });

  it('sign out everywhere with an expired access token: 401, refresh token left alone so the app can refresh and retry', async () => {
    expired();
    const res = await signOut('?all=true');
    expect(res.status).toBe(401);
    expect(revokeRefreshToken).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });

  it('sign out everywhere with a live session revokes everything', async () => {
    const res = await signOut('?all=true');
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt', 'user');
    expect(revokeUserSessions).toHaveBeenCalledWith(USER);
  });

  it('plain sign-out still works with an expired access token', async () => {
    expired();
    const res = await signOut();
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt', 'user');
    expect(requireRepSession).not.toHaveBeenCalled();
  });

  it('a device is still unregistered by its refresh token after the access token expired', async () => {
    expired();
    vi.mocked(findRefreshTokenSubject).mockResolvedValue({ subjectId: USER } as any);
    const res = await signOut('?deviceId=d1');
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith('rt', 'user');
    expect(vi.mocked(MobileDevice.updateOne).mock.calls[0][0]).toMatchObject({ deviceId: 'd1' });
  });
});
