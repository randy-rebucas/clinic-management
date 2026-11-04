import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/auth-helpers', () => ({
  isAdmin: vi.fn(),
  refuseAccess: vi.fn(async () => NextResponse.json({ success: false }, { status: 403 })),
}));
vi.mock('@/lib/api/tenant-session', () => ({
  requireTenantSession: vi.fn(async () => ({ session: { role: 'admin' }, tenantId: '507f1f77bcf86cd799439011' })),
  isTenantSessionError: (v: unknown) => v instanceof NextResponse,
}));
vi.mock('@/lib/cloudinary', () => ({ isCloudinaryConfigured: vi.fn(), uploadToCloudinary: vi.fn() }));
vi.mock('@/lib/storage-tracking', () => ({ checkStorageLimit: vi.fn() }));

import { isAdmin } from '@/app/lib/auth-helpers';
import { isCloudinaryConfigured, uploadToCloudinary } from '@/lib/cloudinary';
import { checkStorageLimit } from '@/lib/storage-tracking';
import { POST } from '@/app/api/queue/display/ads/route';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function send(file: File) {
  const body = new FormData();
  body.append('file', file);
  return POST(new NextRequest('http://x.test/api/queue/display/ads', { method: 'POST', body }));
}
const png = () => new File([PNG], 'ad.png', { type: 'image/png' });

describe('POST /api/queue/display/ads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAdmin).mockReturnValue(true);
    vi.mocked(isCloudinaryConfigured).mockReturnValue(true);
    vi.mocked(checkStorageLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(uploadToCloudinary).mockResolvedValue({ success: true, data: { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/a.png' } } as never);
  });

  it('is for admins only', async () => {
    vi.mocked(isAdmin).mockReturnValue(false);
    expect((await send(png())).status).toBe(403);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it('says so when file storage is missing', async () => {
    vi.mocked(isCloudinaryConfigured).mockReturnValue(false);
    expect((await send(png())).status).toBe(503);
  });

  it('refuses anything that is not really an allowed image', async () => {
    expect((await send(new File(['<svg/>'], 'a.png', { type: 'image/png' }))).status).toBe(415);
    expect((await send(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).status).toBe(415);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it('honours the plan storage limit', async () => {
    vi.mocked(checkStorageLimit).mockResolvedValue({ allowed: false, reason: 'Full' } as never);
    expect((await send(png())).status).toBe(403);
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it('stores it publicly under the clinic and returns the address', async () => {
    const res = await send(png());
    expect(await res.json()).toEqual({ success: true, data: { url: 'https://res.cloudinary.com/demo/image/upload/v1/a.png' } });
    expect(vi.mocked(uploadToCloudinary).mock.calls[0][1]).toMatchObject({ folder: 'queue-display-ads/507f1f77bcf86cd799439011', deliveryType: 'upload', resourceType: 'image' });
  });
});
