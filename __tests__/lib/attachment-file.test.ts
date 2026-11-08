import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cloudinary', () => ({
  isCloudinaryConfigured: vi.fn(),
  uploadToCloudinary: vi.fn(),
  fetchCloudinaryAsset: vi.fn(),
  deleteFromCloudinary: vi.fn(),
  parseCloudinaryUrl: vi.fn(),
  ownedUploadOptions: (o: { tenantSlug: string; tenantId: string }, type: string) => ({ folder: `myclinicsoft/${o.tenantSlug}/${type}`, tags: [`tenant_${o.tenantId}`] }),
}));
vi.mock('@/lib/tenant', () => ({ getTenantSubdomain: vi.fn(async () => 'sunrise-clinic') }));

import { isCloudinaryConfigured, uploadToCloudinary, fetchCloudinaryAsset, parseCloudinaryUrl } from '@/lib/cloudinary';
import { storeAttachment, attachmentResponse, AttachmentStoreError, INLINE_BUDGET_BYTES } from '@/lib/attachment-file';

const file = { buffer: Buffer.from('%PDF-1.4 hello'), contentType: 'application/pdf', filename: 'cbc.pdf' };
const parent = (bytes: number) => ({ model: { aggregate: vi.fn().mockResolvedValue([{ bytes }]) } as any, filter: { _id: 'x' } });

describe('storeAttachment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores on Cloudinary as an authenticated asset when configured', async () => {
    vi.mocked(isCloudinaryConfigured).mockReturnValue(true);
    vi.mocked(uploadToCloudinary).mockResolvedValue({ success: true, data: { secure_url: 'https://res.cloudinary.com/c/raw/authenticated/v1/a' } as any });
    const url = await storeAttachment(file, { tenantId: 't1', kind: 'visit', parent: parent(0) });
    expect(url).toMatch(/^https:\/\/res\.cloudinary\.com/);
    expect(vi.mocked(uploadToCloudinary).mock.calls[0][1]).toMatchObject({ deliveryType: 'authenticated', folder: 'myclinicsoft/sunrise-clinic/visit-files', tags: ['tenant_t1'], resourceType: 'raw' });
  });

  it('falls back to inline while the record has room', async () => {
    vi.mocked(isCloudinaryConfigured).mockReturnValue(false);
    expect(await storeAttachment(file, { tenantId: 't1', kind: 'patient', parent: parent(0) })).toMatch(/^data:application\/pdf;base64,/);
  });

  it('refuses inline storage that would overfill the record', async () => {
    vi.mocked(isCloudinaryConfigured).mockReturnValue(false);
    await expect(storeAttachment(file, { tenantId: 't1', kind: 'patient', parent: parent(INLINE_BUDGET_BYTES) })).rejects.toBeInstanceOf(AttachmentStoreError);
  });
});

describe('attachmentResponse', () => {
  beforeEach(() => vi.clearAllMocks());
  const origin = 'https://clinic.example.com';

  it('serves an inline PDF in the tab', async () => {
    const res = await attachmentResponse({ filename: 'a.pdf', url: `data:application/pdf;base64,${file.buffer.toString('base64')}` }, { download: false, origin });
    expect(res!.headers.get('content-type')).toBe('application/pdf');
    expect(res!.headers.get('content-disposition')).toMatch(/^inline/);
  });

  it('fetches a Cloudinary file and keeps the recorded type', async () => {
    vi.mocked(parseCloudinaryUrl).mockReturnValue({ publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' });
    vi.mocked(fetchCloudinaryAsset).mockResolvedValue({ ok: true, file: { body: new Response(new Uint8Array(file.buffer)).body!, contentType: 'application/octet-stream', size: file.buffer.length } });
    const res = await attachmentResponse({ filename: 'a.pdf', contentType: 'application/pdf', url: 'https://res.cloudinary.com/c/raw/authenticated/v1/a' }, { download: true, origin });
    expect(res!.headers.get('content-disposition')).toMatch(/^attachment/);
    expect(res!.headers.get('content-length')).toBe(String(file.buffer.length));
    expect(Buffer.from(await res!.arrayBuffer()).equals(file.buffer)).toBe(true);
    expect(fetchCloudinaryAsset).toHaveBeenCalled();
  });

  it('answers 502 when Cloudinary fails to serve the file, and null (404) when it is gone', async () => {
    vi.mocked(parseCloudinaryUrl).mockReturnValue({ publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' });
    const stored = { filename: 'a.pdf', url: 'https://res.cloudinary.com/c/raw/authenticated/v1/a' };
    vi.mocked(fetchCloudinaryAsset).mockResolvedValueOnce({ ok: false, reason: 'upstream' });
    expect((await attachmentResponse(stored, { download: false, origin }))!.status).toBe(502);
    vi.mocked(fetchCloudinaryAsset).mockResolvedValueOnce({ ok: false, reason: 'missing' });
    expect(await attachmentResponse(stored, { download: false, origin })).toBeNull();
  });

  it('sends files moved to a Document to its stream route', async () => {
    const res = await attachmentResponse({ url: '/api/documents/507f1f77bcf86cd799439011/stream' }, { download: false, origin });
    expect(res!.headers.get('location')).toBe(`${origin}/api/documents/507f1f77bcf86cd799439011/stream`);
  });

  it('refuses any other URL', async () => {
    vi.mocked(parseCloudinaryUrl).mockReturnValue(null);
    expect(await attachmentResponse({ url: 'https://evil.example/x' }, { download: false, origin })).toBeNull();
  });
});
