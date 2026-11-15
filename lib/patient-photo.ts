/** Validation for the picture a patient sets in eMCR (PUT /api/patients/me/photo). */

/** Decoded size cap. eMCR sends a 512 px JPEG at q0.75 (~30–60 KB); this leaves room for PNGs. */
export const MAX_PHOTO_BYTES = 300 * 1024;
/** Request cap before parsing: base64 is 4/3 of the bytes, plus JSON framing. */
export const MAX_PHOTO_BODY_BYTES = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 1024;

/** Magic bytes per allowed type: the declared type must match what the data actually is. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};

/** A JPEG/PNG/WebP data URI within the size cap, or the reason it isn't one. */
export function checkPhoto(value: unknown): { ok: true; dataUri: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Send the picture as a base64 data URI.' };
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return { ok: false, error: 'Send the picture as a base64 data URI.' };
  const [, mime, base64] = match;
  const sniff = SIGNATURES[mime];
  if (!sniff) return { ok: false, error: 'The picture must be a JPEG, PNG or WebP.' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, error: 'The picture must be 300 KB or smaller.' };
  if (!sniff(bytes)) return { ok: false, error: "The picture's contents don't match its type." };
  return { ok: true, dataUri: value };
}
