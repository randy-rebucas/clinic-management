import 'server-only';
import { NextResponse } from 'next/server';
import DocumentModel from '@/models/Document';
import { fetchCloudinaryAsset, cloudinaryRefFromStored, deleteFromCloudinary, isCloudinaryConfigured, CloudinaryAssetRef } from '@/lib/cloudinary';

/**
 * Locate a stored document's bytes. Files live either inline as a data URL or on this
 * account's Cloudinary; any other URL (e.g. one written by a tampered update) is ignored,
 * so the app never redirects or proxies to an arbitrary host.
 */
export function cloudinaryRefForDocument(doc: { url?: string; metadata?: any }): CloudinaryAssetRef | null {
  return cloudinaryRefFromStored(doc.url, doc.metadata);
}

/** Cloudinary failed to serve a file that should be there (not the same as the file being gone). */
export class FileUpstreamError extends Error {
  constructor() {
    super('The file store did not serve the file');
    this.name = 'FileUpstreamError';
  }
}

/** The 502 for a FileUpstreamError thrown by loadDocumentFile; null for any other error. */
export function fileUpstreamResponse(error: unknown): NextResponse | null {
  if (!(error instanceof FileUpstreamError)) return null;
  return NextResponse.json(
    { success: false, code: 'FILE_STORE_UNAVAILABLE', error: 'The file couldn’t be loaded right now. Please try again.' },
    { status: 502 }
  );
}

/**
 * A document's file, ready to hand to a Response. Cloudinary files are streamed through as
 * they arrive; `size` is set only when the byte count is known.
 * Null when there is no file (answer 404); throws FileUpstreamError when Cloudinary failed to
 * serve it (answer 502, see fileUpstreamResponse).
 */
export async function loadDocumentFile(doc: {
  url?: string;
  metadata?: any;
  contentType?: string;
}): Promise<{ body: BodyInit; contentType: string; size?: number } | null> {
  const url = doc.url || '';
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0) return null;
    const bytes = new Uint8Array(Buffer.from(url.slice(comma + 1), 'base64'));
    return { body: bytes, contentType: doc.contentType || 'application/octet-stream', size: bytes.length };
  }
  if (!isCloudinaryConfigured()) return null;
  const ref = cloudinaryRefForDocument(doc);
  if (!ref) return null;
  const result = await fetchCloudinaryAsset(ref);
  if (!result.ok) {
    if (result.reason === 'upstream') throw new FileUpstreamError();
    return null;
  }
  const file = result.file;
  // The recorded content type (validated at upload) wins over whatever the CDN reports.
  return { body: file.body, contentType: doc.contentType || file.contentType, size: file.size };
}

/**
 * Remove a document's stored file from Cloudinary. `gone` is true when nothing is left there
 * (removed now, already gone, or the file was never on Cloudinary). `fields` are the `$set`
 * paths that record it on the record: where the file was, so a failed removal can be retried
 * by retryPendingFileRemovals (lib/storage-optimization.ts) after the URL is wiped, and when it
 * went.
 */
export async function removeDocumentFile(doc: { url?: string; metadata?: any }): Promise<{ gone: boolean; fields: Record<string, unknown> }> {
  const ref = cloudinaryRefForDocument(doc);
  if (!ref) return { gone: true, fields: {} };
  const result = await deleteFromCloudinary(ref.publicId, { resourceType: ref.resourceType, deliveryType: ref.deliveryType });
  if (!result.success) console.error(`Document file not removed from Cloudinary: ${ref.publicId} (${result.error ?? 'failed'})`);
  return {
    gone: result.success,
    fields: {
      'metadata.cloudinaryPublicId': ref.publicId,
      'metadata.cloudinaryResourceType': ref.resourceType,
      'metadata.cloudinaryDeliveryType': ref.deliveryType,
      ...(ref.format ? { 'metadata.cloudinaryFormat': ref.format } : {}),
      ...(result.success ? { 'metadata.fileRemovedAt': new Date() } : {}),
    },
  };
}

/** Records of deleted documents whose Cloudinary file may still exist. */
export const PENDING_FILE_REMOVAL = {
  status: 'deleted',
  'metadata.cloudinaryPublicId': { $exists: true },
  'metadata.fileRemovedAt': { $exists: false },
} as const;

/**
 * Delete a document the way the app always does: the record stays for the audit trail, the
 * file goes. A Cloudinary file is removed (or left marked for retry), and an inline file
 * (stored in the record as a data URL) is wiped with any OCR text. Null when no record matches.
 */
export async function softDeleteDocument(
  filter: Record<string, unknown>,
  document: { url?: string; metadata?: any },
  userId: string
): Promise<{ deleted: { _id: unknown; documentCode?: string; status: string } | null; fileGone: boolean }> {
  const { gone, fields } = await removeDocumentFile(document);
  const deleted = await DocumentModel.findOneAndUpdate(
    filter,
    {
      $set: { status: 'deleted', url: 'removed:', lastModifiedBy: userId, lastModifiedDate: new Date(), ...fields },
      $unset: { ocrText: 1, thumbnailUrl: 1 },
    },
    { new: true }
  )
    .select('_id documentCode status')
    .lean<{ _id: unknown; documentCode?: string; status: string } | null>();
  return { deleted, fileGone: gone };
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
