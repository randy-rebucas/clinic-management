import 'server-only';
import { NextResponse } from 'next/server';
import type { Model } from 'mongoose';
import {
  deleteFromCloudinary,
  fetchCloudinaryAsset,
  isCloudinaryConfigured,
  parseCloudinaryUrl,
  safeFolderSegment,
  uploadToCloudinary,
} from '@/lib/cloudinary';
import { INLINE_SAFE_TYPES } from '@/lib/upload-validation';

/**
 * Files attached to patients, visits and lab results.
 *
 * With Cloudinary configured they are stored there as authenticated (non-public) assets and the
 * record keeps only the delivery URL, which is useless without a signature. Without it (local
 * setups) they stay inline as data URLs, up to INLINE_BUDGET_BYTES per record so the parent
 * document stays under MongoDB's 16 MB limit. Either way the bytes reach the browser only through
 * the app's own file routes, via attachmentResponse().
 */

/** Inline files one record may hold: base64 adds a third, and the record needs room for itself. */
export const INLINE_BUDGET_BYTES = 10 * 1024 * 1024;

export type AttachmentKind = 'patient' | 'visit' | 'lab-result';

export class AttachmentStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Store an uploaded file and return the `url` to save on the attachment. `parent` is the record's
 * model and filter, used to check inline room when Cloudinary is not configured.
 */
export async function storeAttachment(
  file: { buffer: Buffer; contentType: string; filename: string },
  opts: { tenantId: string; kind: AttachmentKind; parent: { model: Model<any>; filter: Record<string, unknown> } }
): Promise<string> {
  if (isCloudinaryConfigured()) {
    const result = await uploadToCloudinary(file.buffer, {
      // Tenant and kind only: patient identifiers stay out of folder names, which show in URLs.
      folder: `clinic-attachments/${safeFolderSegment(opts.tenantId, 'tenant')}/${opts.kind}`,
      resourceType: file.contentType.startsWith('image/') ? 'image' : 'raw',
      deliveryType: 'authenticated',
      contentType: file.contentType,
    });
    if (!result.success || !result.data) throw new AttachmentStoreError('The file could not be stored. Try again.', 502);
    return result.data.secure_url;
  }

  const [used] = await opts.parent.model.aggregate([
    { $match: opts.parent.filter },
    { $project: { bytes: { $sum: { $map: { input: { $ifNull: ['$attachments', []] }, as: 'a', in: { $ifNull: ['$$a.size', 0] } } } } } },
  ]);
  if ((used?.bytes ?? 0) + file.buffer.length > INLINE_BUDGET_BYTES) {
    throw new AttachmentStoreError(
      'This record has no room for more files. Ask your administrator to set up file storage (Cloudinary).',
      413
    );
  }
  return `data:${file.contentType};base64,${file.buffer.toString('base64')}`;
}

/** Remove a stored file from Cloudinary (inline files go with their record). Never throws. */
export async function deleteStoredAttachment(url: string | undefined | null): Promise<void> {
  const ref = parseCloudinaryUrl(url);
  if (!ref) return;
  const result = await deleteFromCloudinary(ref.publicId, { resourceType: ref.resourceType, deliveryType: ref.deliveryType }).catch(
    () => ({ success: false })
  );
  if (!result.success) console.error(`Attachment file not removed from Cloudinary: ${ref.publicId}`);
}

/**
 * The file as an HTTP response: shown in the tab when the type is safe to render (images, PDF,
 * text), otherwise downloaded (`download` always downloads). Null when the file can't be found.
 */
export async function attachmentResponse(
  file: { filename?: string; contentType?: string; url?: string },
  opts: { download: boolean; origin: string }
): Promise<NextResponse | null> {
  const { download } = opts;
  const url = file.url ?? '';
  let bytes: Buffer;
  let type: string;

  const inline = /^data:([^;,]+);base64,([\s\S]*)$/.exec(url);
  if (inline) {
    type = inline[1].toLowerCase();
    bytes = Buffer.from(inline[2], 'base64');
  } else if (url.startsWith('/api/documents/') && /^\/api\/documents\/[a-f0-9]{24}\/stream$/.test(url)) {
    // Moved to a Document by scripts/migrate-cloudinary-private.ts; that route checks access itself.
    return NextResponse.redirect(new URL(url, opts.origin));
  } else {
    const ref = parseCloudinaryUrl(url);
    if (!ref) return null;
    const fetched = await fetchCloudinaryAsset(ref);
    if (!fetched) return null;
    // The type recorded at upload (validated then) wins over whatever the CDN reports.
    type = (file.contentType || fetched.contentType).toLowerCase();
    bytes = fetched.buffer;
  }

  const showInline = !download && INLINE_SAFE_TYPES.has(type);
  const name = (file.filename || 'file').replace(/["\r\n]/g, '');
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': showInline ? type : 'application/octet-stream',
      'Content-Disposition': `${showInline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      // Browsers refuse to show a PDF in a sandboxed document, so only other types get the sandbox.
      ...(type === 'application/pdf' ? {} : { 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" }),
      'Cache-Control': 'private, no-store',
    },
  });
}
