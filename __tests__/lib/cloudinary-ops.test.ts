import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';

vi.hoisted(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  delete process.env.CLOUDINARY_ROOT_FOLDER;
});

const sdk = vi.hoisted(() => ({
  config: vi.fn(),
  uploader: { destroy: vi.fn(), upload_stream: vi.fn() },
  api: { delete_resources_by_prefix: vi.fn(), delete_resources_by_tag: vi.fn() },
  utils: { private_download_url: vi.fn(() => 'https://api.cloudinary.com/v1_1/democloud/raw/download?signed') },
}));
vi.mock('cloudinary', () => ({ v2: sdk }));

import {
  assetFolder,
  deleteCloudinaryAssets,
  deleteFromCloudinary,
  openCloudinaryAsset,
  fetchCloudinaryAsset,
  ownAdImageRef,
  ownedUploadOptions,
  tenantFolder,
  uploadDocumentToCloudinary,
  uploadToCloudinary,
} from '@/lib/cloudinary';

const TENANT = '507f1f77bcf86cd799439011';
const SLUG = 'sunrise-clinic';

beforeEach(() => vi.clearAllMocks());

describe('deleteFromCloudinary', () => {
  it('counts an asset that is already gone as deleted', async () => {
    sdk.uploader.destroy.mockResolvedValue({ result: 'not found' });
    expect(await deleteFromCloudinary('a', { resourceType: 'raw', deliveryType: 'authenticated' })).toEqual({ success: true, alreadyGone: true });
  });

  it('reports any other refusal as a failure', async () => {
    sdk.uploader.destroy.mockResolvedValue({ result: 'error' });
    expect((await deleteFromCloudinary('a')).success).toBe(false);
  });
});

describe('deleteCloudinaryAssets', () => {
  it('keeps going until Cloudinary has no more to delete', async () => {
    sdk.api.delete_resources_by_prefix
      .mockResolvedValueOnce({ deleted: { a: 'deleted', b: 'deleted' }, next_cursor: 'c1' })
      .mockResolvedValueOnce({ deleted: { c: 'deleted', d: 'not_found' } });
    const res = await deleteCloudinaryAssets({ prefix: 'myclinicsoft/t/', deliveryType: 'authenticated' }, 'raw');
    expect(res).toEqual({ deleted: 3 });
    expect(sdk.api.delete_resources_by_prefix).toHaveBeenCalledTimes(2);
    expect(sdk.api.delete_resources_by_prefix.mock.calls[1][1]).toMatchObject({ next_cursor: 'c1', type: 'authenticated', resource_type: 'raw' });
  });

  it('returns what it managed and the error when a call fails', async () => {
    sdk.api.delete_resources_by_prefix
      .mockResolvedValueOnce({ deleted: { a: 'deleted' }, next_cursor: 'c1' })
      .mockRejectedValueOnce({ error: { message: 'Rate limited' } });
    expect(await deleteCloudinaryAssets({ prefix: 'myclinicsoft/t/', deliveryType: 'upload' }, 'image')).toEqual({ deleted: 1, error: 'Rate limited' });
  });

  it('repeats a partial delete by tag until nothing more goes', async () => {
    sdk.api.delete_resources_by_tag
      .mockResolvedValueOnce({ deleted: { a: 'deleted' }, partial: true })
      .mockResolvedValueOnce({ deleted: { b: 'deleted' } });
    expect(await deleteCloudinaryAssets({ tag: `tenant_${TENANT}` }, 'image')).toEqual({ deleted: 2 });
    expect(sdk.api.delete_resources_by_tag).toHaveBeenCalledTimes(2);
  });

  it('refuses a prefix that would reach past one clinic', async () => {
    expect((await deleteCloudinaryAssets({ prefix: 'myclinicsoft/', deliveryType: 'upload' }, 'image')).error).toMatch(/broad prefix/);
    expect(sdk.api.delete_resources_by_prefix).not.toHaveBeenCalled();
  });
});

describe('folder layout', () => {
  it('puts every file under {root}/{clinic subdomain}/{type} and tags it with the clinic id', () => {
    expect(tenantFolder(SLUG)).toBe('myclinicsoft/sunrise-clinic');
    expect(assetFolder(SLUG, 'visit-files')).toBe('myclinicsoft/sunrise-clinic/visit-files');
    expect(ownedUploadOptions({ tenantId: TENANT, tenantSlug: SLUG }, 'display-ads', ['Promo 1'])).toEqual({
      folder: 'myclinicsoft/sunrise-clinic/display-ads',
      tags: [`tenant_${TENANT}`, 'display-ads', 'promo_1'],
    });
  });

  it('never lets a missing subdomain fall into the root', () => {
    expect(tenantFolder('')).toBe('myclinicsoft/no_clinic');
  });

  it('stores documents privately in the clinic documents folder with the category as a tag', async () => {
    sdk.uploader.upload_stream.mockImplementation((_opts: unknown, cb: (e: unknown, r: unknown) => void) => {
      const stream = new PassThrough();
      stream.on('finish', () => cb(undefined, { public_id: 'x', type: 'authenticated' }));
      stream.resume();
      return stream;
    });
    await uploadDocumentToCloudinary(new File(['%PDF-'], 'a.pdf'), 'laboratory_result', { tenantId: TENANT, tenantSlug: SLUG }, { tags: ['cbc'] });
    expect(sdk.uploader.upload_stream.mock.calls[0][0]).toMatchObject({
      folder: 'myclinicsoft/sunrise-clinic/documents',
      type: 'authenticated',
      tags: [`tenant_${TENANT}`, 'documents', 'laboratory_result', 'cbc'],
    });
  });
});

describe('uploadToCloudinary', () => {
  it('streams the raw bytes to the upload API', async () => {
    let received = Buffer.alloc(0);
    sdk.uploader.upload_stream.mockImplementation((_opts: unknown, cb: (e: unknown, r: unknown) => void) => {
      const stream = new PassThrough();
      stream.on('data', (c: Buffer) => (received = Buffer.concat([received, c])));
      stream.on('end', () => cb(undefined, { public_id: 'x', secure_url: 'https://res.cloudinary.com/democloud/raw/authenticated/v1/x', type: 'authenticated', bytes: 5 }));
      return stream;
    });
    const res = await uploadToCloudinary(Buffer.from('%PDF-'), { resourceType: 'raw', folder: 'myclinicsoft/c/documents' });
    expect(res.success).toBe(true);
    expect(received.toString()).toBe('%PDF-');
    expect(sdk.uploader.upload_stream.mock.calls[0][0]).toMatchObject({ type: 'authenticated', resource_type: 'raw', folder: 'myclinicsoft/c/documents' });
  });

  it('refuses to store anything outside the app’s root folder in the shared account', async () => {
    expect((await uploadToCloudinary(Buffer.from('x'), { folder: 'clinic-documents' })).success).toBe(false);
    expect((await uploadToCloudinary(Buffer.from('x'), { folder: 'myclinicsoft-other/c' })).success).toBe(false);
    expect(sdk.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it('reports a failed upload', async () => {
    sdk.uploader.upload_stream.mockImplementation((_opts: unknown, cb: (e: unknown) => void) => {
      const stream = new PassThrough();
      stream.on('finish', () => cb(new Error('boom')));
      return stream;
    });
    expect(await uploadToCloudinary(Buffer.from('x'), { folder: 'myclinicsoft/c/documents' })).toEqual({ success: false, error: 'Failed to upload file' });
  });
});

describe('openCloudinaryAsset', () => {
  it('hands back the body as a stream, with its size only when nothing re-encodes it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(new Response('hello', { headers: { 'content-type': 'application/pdf', 'content-length': '5' } }));
    const plain = await openCloudinaryAsset({ publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' });
    expect(plain!.size).toBe(5);
    expect(await new Response(plain!.body).text()).toBe('hello');

    fetchMock.mockResolvedValueOnce(new Response('hello', { headers: { 'content-length': '3', 'content-encoding': 'gzip' } }));
    const encoded = await openCloudinaryAsset({ publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' });
    expect(encoded!.size).toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    expect(await openCloudinaryAsset({ publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' })).toBeNull();

    // Gone (404) and failing (5xx, network) are told apart for the route's 404 vs 502.
    const ref = { publicId: 'a', resourceType: 'raw', deliveryType: 'authenticated' } as const;
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    expect(await fetchCloudinaryAsset(ref)).toEqual({ ok: false, reason: 'missing' });
    fetchMock.mockResolvedValueOnce(new Response('down', { status: 503 }));
    expect(await fetchCloudinaryAsset(ref)).toEqual({ ok: false, reason: 'upstream' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await fetchCloudinaryAsset(ref)).toEqual({ ok: false, reason: 'upstream' });
    fetchMock.mockRestore();
  });
});

describe('ownAdImageRef', () => {
  const url = (cloud: string, path: string) => `https://res.cloudinary.com/${cloud}/image/upload/v1/${path}.png`;

  it('accepts this account’s public image in the clinic’s ad folder', () => {
    expect(ownAdImageRef(url('democloud', 'myclinicsoft/sunrise-clinic/display-ads/promo'), SLUG)).toMatchObject({
      publicId: 'myclinicsoft/sunrise-clinic/display-ads/promo',
    });
  });

  it('refuses another account, another clinic, another folder or a private asset', () => {
    expect(ownAdImageRef(url('othercloud', 'myclinicsoft/sunrise-clinic/display-ads/promo'), SLUG)).toBeNull();
    expect(ownAdImageRef(url('democloud', 'myclinicsoft/sunrise-clinic-2/display-ads/promo'), SLUG)).toBeNull();
    expect(ownAdImageRef(url('democloud', 'otherapp/sunrise-clinic/display-ads/promo'), SLUG)).toBeNull();
    expect(ownAdImageRef(url('democloud', 'myclinicsoft/sunrise-clinic/documents/xray'), SLUG)).toBeNull();
    expect(ownAdImageRef('https://res.cloudinary.com/democloud/image/authenticated/v1/myclinicsoft/sunrise-clinic/display-ads/promo.png', SLUG)).toBeNull();
  });
});
