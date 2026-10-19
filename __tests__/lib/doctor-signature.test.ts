import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { parseSignatureImage, pickSignature, MAX_SIGNATURE_BYTES } = await import('@/lib/doctor-signature');
const { pdfFilename } = await import('@/lib/pdf');

const png = (bytes: number) => `data:image/png;base64,${Buffer.alloc(bytes, 7).toString('base64')}`;

describe('parseSignatureImage', () => {
  it('accepts a PNG data URL within the limit', () => {
    const result = parseSignatureImage(png(5000));
    expect(result.ok).toBe(true);
  });

  it('rejects non-image and remote values', () => {
    expect(parseSignatureImage('https://example.com/sig.png').ok).toBe(false);
    expect(parseSignatureImage('data:image/svg+xml;base64,PHN2Zz4=').ok).toBe(false);
    expect(parseSignatureImage(undefined).ok).toBe(false);
  });

  it('rejects GIF even though the print helper allows it', () => {
    const gif = `data:image/gif;base64,${Buffer.alloc(500).toString('base64')}`;
    expect(parseSignatureImage(gif).ok).toBe(false);
  });

  it('rejects an empty canvas and oversized images', () => {
    expect(parseSignatureImage(png(50)).ok).toBe(false);
    expect(parseSignatureImage(png(MAX_SIGNATURE_BYTES + 1)).ok).toBe(false);
  });
});

describe('pickSignature', () => {
  const signer = {
    doctorId: 'd1',
    name: 'Dr. A',
    licenseNumber: null,
    ptr: null,
    s2Number: null,
    signatureSrc: png(300),
  };

  it('prefers the signature drawn on the document', () => {
    const own = png(400);
    expect(pickSignature(own, signer, true)).toBe(own);
  });

  it('falls back to the stored signature only when allowed', () => {
    expect(pickSignature(undefined, signer, true)).toBe(signer.signatureSrc);
    expect(pickSignature(undefined, signer, false)).toBeNull();
    expect(pickSignature(undefined, null, true)).toBeNull();
  });
});

describe('pdfFilename', () => {
  it('builds a safe filename', () => {
    expect(pdfFilename('Prescription', 'RX-2026/001')).toBe('Prescription-RX-2026-001.pdf');
    expect(pdfFilename('Receipt', undefined)).toBe('Receipt.pdf');
    expect(pdfFilename('"; rm -rf', null)).toBe('rm-rf.pdf');
  });
});
