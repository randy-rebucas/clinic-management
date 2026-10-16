/**
 * Validation for files uploaded by staff. The browser-supplied MIME type is not trusted:
 * it must be on the allowlist AND match the file's magic bytes, so a stored file can't
 * later be served back as HTML/SVG/script.
 */

export const ALLOWED_UPLOAD_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
] as const;

/** Office formats accepted for clinic documents; always served as downloads. */
export const OFFICE_UPLOAD_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export const DOCUMENT_UPLOAD_TYPES: readonly string[] = [...ALLOWED_UPLOAD_TYPES, ...OFFICE_UPLOAD_TYPES];

/** Types that are safe to render inline in the browser (everything else downloads). */
export const INLINE_SAFE_TYPES = new Set<string>(ALLOWED_UPLOAD_TYPES);

/** Files stored inline as data URLs live inside a MongoDB document (16MB cap incl. base64 overhead). */
export const MAX_INLINE_UPLOAD_BYTES = 5 * 1024 * 1024;

function startsWith(buf: Uint8Array, sig: number[], offset = 0) {
  if (buf.length < offset + sig.length) return false;
  return sig.every((b, i) => buf[offset + i] === b);
}

/** Detect the real type from content. Returns null when it doesn't match an allowed type. */
export function sniffContentType(buf: Uint8Array, claimed: string): string | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if ((claimed === 'application/msword' || claimed === 'application/vnd.ms-excel')
    && startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return claimed;
  if (claimed.startsWith('application/vnd.openxmlformats-officedocument.')
    && startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return claimed;
  if (claimed === 'text/plain') {
    // Plain text: no NUL bytes and no markup that a browser could sniff as HTML.
    const head = Buffer.from(buf.subarray(0, 1024)).toString('utf8').toLowerCase();
    if (buf.subarray(0, 1024).includes(0)) return null;
    if (/<\s*(html|script|svg|iframe|body|!doctype)/.test(head)) return null;
    return 'text/plain';
  }
  return null;
}

/**
 * Response headers for serving a stored file. Only allowlisted types render inline;
 * anything else (including legacy records with e.g. text/html or SVG) is forced to
 * download, and a sandbox CSP stops any active content from running on our origin.
 */
export function fileResponseHeaders(
  contentType: string | undefined | null,
  filename: string | undefined | null,
  opts: { download?: boolean; size?: number } = {}
): Record<string, string> {
  const type = String(contentType || '').toLowerCase().split(';')[0].trim();
  const inline = !opts.download && INLINE_SAFE_TYPES.has(type);
  const name = safeFilename(filename);
  const headers: Record<string, string> = {
    'Content-Type': inline ? type : (type && /^[\w.+-]+\/[\w.+-]+$/.test(type) && !/html|xml|svg|javascript/.test(type) ? type : 'application/octet-stream'),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  };
  // Chrome refuses to render PDFs in a sandboxed document, and a magic-byte-checked PDF
  // can't run script on our origin, so inline PDFs are the one exception.
  if (!(inline && type === 'application/pdf')) headers['Content-Security-Policy'] = 'sandbox';
  if (opts.size !== undefined) headers['Content-Length'] = String(opts.size);
  return headers;
}

export type UploadCheck =
  | { ok: true; contentType: string; buffer: Buffer; filename: string }
  | { ok: false; error: string; status: number };

export function safeFilename(name: string | undefined | null): string {
  const base = String(name || 'file').split(/[\\/]/).pop() || 'file';
  return base.replace(/[^\w.\- ()]/g, '_').slice(0, 200) || 'file';
}

/** Read and validate an uploaded File. */
export async function validateUpload(
  file: File | null | undefined,
  opts: { maxBytes?: number; allowed?: readonly string[] } = {}
): Promise<UploadCheck> {
  if (!file || typeof (file as any).arrayBuffer !== 'function') {
    return { ok: false, error: 'No file provided', status: 400 };
  }
  const maxBytes = opts.maxBytes ?? MAX_INLINE_UPLOAD_BYTES;
  if (file.size <= 0) return { ok: false, error: 'File is empty', status: 400 };
  if (file.size > maxBytes) {
    return { ok: false, error: `File too large. Maximum size is ${Math.floor(maxBytes / (1024 * 1024))}MB`, status: 413 };
  }
  const allowed = opts.allowed ?? ALLOWED_UPLOAD_TYPES;
  let claimed = (file.type || '').toLowerCase();
  if (claimed === 'image/jpg') claimed = 'image/jpeg';
  if (!allowed.includes(claimed)) {
    return { ok: false, error: 'File type not allowed. Upload a PDF, image (JPEG, PNG, GIF, WebP) or other supported document.', status: 415 };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = sniffContentType(buffer, claimed);
  if (!detected || detected !== claimed) {
    return { ok: false, error: 'File content does not match its type', status: 415 };
  }
  return { ok: true, contentType: detected, buffer, filename: safeFilename(file.name) };
}
