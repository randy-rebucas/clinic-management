import 'server-only';
import { fetchCloudinaryAsset, cloudinaryRefFromStored, isCloudinaryConfigured, CloudinaryAssetRef } from '@/lib/cloudinary';

/**
 * Locate a stored document's bytes. Files live either inline as a data URL or on this
 * account's Cloudinary; any other URL (e.g. one written by a tampered update) is ignored,
 * so the app never redirects or proxies to an arbitrary host.
 */
export function cloudinaryRefForDocument(doc: { url?: string; metadata?: any }): CloudinaryAssetRef | null {
  return cloudinaryRefFromStored(doc.url, doc.metadata);
}

export async function loadDocumentFile(doc: {
  url?: string;
  metadata?: any;
  contentType?: string;
}): Promise<{ buffer: Buffer; contentType: string } | null> {
  const url = doc.url || '';
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    return {
      buffer: Buffer.from(url.slice(comma + 1), 'base64'),
      contentType: doc.contentType || 'application/octet-stream',
    };
  }
  if (!isCloudinaryConfigured()) return null;
  const ref = cloudinaryRefForDocument(doc);
  if (!ref) return null;
  const file = await fetchCloudinaryAsset(ref);
  if (!file) return null;
  // The recorded content type (validated at upload) wins over whatever the CDN reports.
  return { buffer: file.buffer, contentType: doc.contentType || file.contentType };
}

/** Public-facing representation: file URLs always go through the authenticated stream route. */
export function withStreamUrls<T extends { _id?: any; url?: string; thumbnailUrl?: string; documentType?: string }>(doc: T): T {
  if (!doc || !doc._id) return doc;
  const stream = `/api/documents/${String(doc._id)}/stream`;
  return {
    ...doc,
    url: stream,
    thumbnailUrl: doc.documentType === 'image' ? stream : undefined,
  };
}
