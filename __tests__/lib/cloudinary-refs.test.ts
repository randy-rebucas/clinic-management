import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// lib/cloudinary configures the SDK at import time.
vi.hoisted(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'democloud';
  process.env.CLOUDINARY_API_KEY = 'key';
  process.env.CLOUDINARY_API_SECRET = 'secret';
});

import { cloudinaryRefFromStored, parseCloudinaryUrl, getPrivateDownloadUrl } from '@/lib/cloudinary';
import { cloudinaryRefForDocument } from '@/lib/document-file';

const LEGACY_IMAGE = 'https://res.cloudinary.com/democloud/image/upload/v1700000000/clinic-documents/abc/photo_1.jpg';
const LEGACY_RAW = 'https://res.cloudinary.com/democloud/raw/upload/v1700000000/clinic-documents/abc/report.pdf';
const AUTH_IMAGE = 'https://res.cloudinary.com/democloud/image/authenticated/s--sig--/v1700000001/clinic-documents/t1/xray.png';

describe('parseCloudinaryUrl', () => {
  it('parses legacy public and authenticated URLs', () => {
    expect(parseCloudinaryUrl(LEGACY_IMAGE)).toEqual({
      publicId: 'clinic-documents/abc/photo_1', resourceType: 'image', deliveryType: 'upload', format: 'jpg',
    });
    expect(parseCloudinaryUrl(LEGACY_RAW)).toEqual({
      publicId: 'clinic-documents/abc/report.pdf', resourceType: 'raw', deliveryType: 'upload',
    });
    expect(parseCloudinaryUrl(AUTH_IMAGE)?.deliveryType).toBe('authenticated');
  });

  it('rejects other clouds and hosts', () => {
    expect(parseCloudinaryUrl(LEGACY_IMAGE.replace('democloud', 'evil'))).toBeNull();
    expect(parseCloudinaryUrl('https://evil.example.com/democloud/image/upload/x.jpg')).toBeNull();
  });
});

describe('cloudinaryRefFromStored', () => {
  it('legacy record with only a public id and a public URL resolves as a public asset', () => {
    expect(cloudinaryRefFromStored(LEGACY_RAW, { cloudinaryPublicId: 'clinic-documents/abc/report.pdf' })).toEqual({
      publicId: 'clinic-documents/abc/report.pdf', resourceType: 'raw', deliveryType: 'upload', format: undefined,
    });
  });

  it('migrated record (stream URL, authenticated metadata) resolves from metadata alone', () => {
    const ref = cloudinaryRefFromStored('/api/documents/abc/stream', {
      cloudinaryPublicId: 'clinic-documents/abc/photo_1',
      cloudinaryResourceType: 'image',
      cloudinaryDeliveryType: 'authenticated',
      cloudinaryFormat: 'jpg',
    });
    expect(ref).toEqual({ publicId: 'clinic-documents/abc/photo_1', resourceType: 'image', deliveryType: 'authenticated', format: 'jpg' });
  });

  it('metadata delivery type wins over a stale public URL', () => {
    const ref = cloudinaryRefFromStored(LEGACY_IMAGE, {
      cloudinaryPublicId: 'clinic-documents/abc/photo_1',
      cloudinaryDeliveryType: 'authenticated',
    });
    expect(ref?.deliveryType).toBe('authenticated');
    expect(ref?.format).toBe('jpg');
  });

  it('ignores invalid metadata enum values and URLs for a different asset', () => {
    const ref = cloudinaryRefFromStored(LEGACY_RAW, {
      cloudinaryPublicId: 'clinic-documents/other/file',
      cloudinaryResourceType: 'javascript',
      cloudinaryDeliveryType: 'fetch',
    });
    expect(ref).toEqual({ publicId: 'clinic-documents/other/file', resourceType: 'image', deliveryType: 'upload', format: undefined });
  });

  it('falls back to the URL and returns null for non-Cloudinary data', () => {
    expect(cloudinaryRefFromStored(AUTH_IMAGE, undefined)?.publicId).toBe('clinic-documents/t1/xray');
    expect(cloudinaryRefFromStored('data:image/png;base64,AAAA', {})).toBeNull();
    expect(cloudinaryRefFromStored('https://example.com/a.png', { cloudinaryPublicId: 123 })).toBeNull();
  });

  it('cloudinaryRefForDocument delegates to it', () => {
    const doc = { url: LEGACY_IMAGE, metadata: { cloudinaryPublicId: 'clinic-documents/abc/photo_1' } };
    expect(cloudinaryRefForDocument(doc)).toEqual(cloudinaryRefFromStored(doc.url, doc.metadata));
  });
});

describe('getPrivateDownloadUrl', () => {
  it('signs a short-lived API download for both delivery types', () => {
    for (const type of ['authenticated', 'upload'] as const) {
      const url = new URL(getPrivateDownloadUrl({ publicId: 'clinic-documents/abc/photo_1', resourceType: 'image', deliveryType: type, format: 'jpg' }));
      expect(url.hostname).toBe('api.cloudinary.com');
      expect(url.pathname).toContain('/democloud/image/download');
      expect(url.searchParams.get('type')).toBe(type);
      expect(url.searchParams.get('signature')).toBeTruthy();
      const expires = Number(url.searchParams.get('expires_at'));
      expect(expires - Date.now() / 1000).toBeLessThanOrEqual(301);
    }
  });
});
