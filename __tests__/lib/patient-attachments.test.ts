import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { ownAttachments, ownAttachmentMatch } from '@/lib/patient-attachments';

describe('ownAttachments', () => {
  const clinicA = new Types.ObjectId();
  const clinicB = new Types.ObjectId();
  const files = [
    { filename: 'a.pdf', tenantId: clinicA },
    { filename: 'b.pdf', tenantId: clinicB },
    { filename: 'legacy.pdf' },
  ];

  it('keeps only the files the clinic uploaded', () => {
    expect(ownAttachments(files, String(clinicA)).map((f) => f.filename)).toEqual(['a.pdf']);
    expect(ownAttachments(files, clinicB).map((f) => f.filename)).toEqual(['b.pdf']);
  });

  it('hides files with no clinic until they are assigned', () => {
    expect(ownAttachments(files.slice(2), clinicA)).toEqual([]);
  });

  it('handles a record with no files', () => {
    expect(ownAttachments(undefined, clinicA)).toEqual([]);
  });

  it('matches a file by id and clinic', () => {
    const fileId = new Types.ObjectId();
    const match = ownAttachmentMatch(String(clinicA), String(fileId));
    expect(String(match._id)).toBe(String(fileId));
    expect(String(match.tenantId)).toBe(String(clinicA));
  });
});
