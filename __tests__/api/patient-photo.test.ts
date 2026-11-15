import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/mongodb', () => ({ default: vi.fn() }));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/app/lib/patient-auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    verifyPatientAuth: vi.fn(),
    patientAuthError: () => NextResponse.json({ success: false, error: 'Not authenticated. Please login.' }, { status: 401 }),
  };
});
vi.mock('@/models/Patient', () => ({ default: { updateOne: vi.fn(), findById: vi.fn(), exists: vi.fn() } }));
vi.mock('@/lib/audit', () => ({ recordPatientRefused: vi.fn() }));
const photoLimit = vi.hoisted(() => ({ limited: false, keys: [] as string[] }));
vi.mock('@/lib/middleware/rate-limit', async () => {
  const { NextResponse } = await import('next/server');
  return {
    rateLimit: () => async (_request: unknown, key?: string) => {
      photoLimit.keys.push(String(key));
      return photoLimit.limited ? NextResponse.json({ success: false, error: 'Too many' }, { status: 429 }) : null;
    },
  };
});

import { verifyPatientAuth } from '@/app/lib/patient-auth';
import Patient from '@/models/Patient';
import { DELETE, PUT } from '@/app/api/patients/me/photo/route';
import { GET as getMe } from '@/app/api/patients/me/route';
import { MAX_PHOTO_BYTES, checkPhoto } from '@/lib/patient-photo';

const PATIENT_ID = '507f1f77bcf86cd799439033';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const jpegUri = (bytes = JPEG) => `data:image/jpeg;base64,${bytes.toString('base64')}`;

const put = (body: unknown) =>
  PUT(new NextRequest('http://localhost/api/patients/me/photo', { method: 'PUT', body: JSON.stringify(body) }));
const del = () => DELETE(new NextRequest('http://localhost/api/patients/me/photo', { method: 'DELETE' }));

describe('PUT/DELETE /api/patients/me/photo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.updateOne).mockResolvedValue({ matchedCount: 1, modifiedCount: 1 } as any);
    photoLimit.limited = false;
    photoLimit.keys = [];
  });

  it('401 without a session, nothing written', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue(null);
    expect((await put({ image: jpegUri() })).status).toBe(401);
    expect((await del()).status).toBe(401);
    expect(Patient.updateOne).not.toHaveBeenCalled();
  });

  it("saves a JPEG on the session's own active record", async () => {
    const res = await put({ image: jpegUri() });
    expect(res.status).toBe(200);
    expect((await res.json()).data.profileImage).toBe(jpegUri());
    expect(Patient.updateOne).toHaveBeenCalledWith(
      { _id: PATIENT_ID, active: { $ne: false } },
      { $set: { profileImage: jpegUri() } }
    );
  });

  it('403 when the record is inactive', async () => {
    vi.mocked(Patient.updateOne).mockResolvedValue({ matchedCount: 0, modifiedCount: 0 } as any);
    expect((await put({ image: jpegUri() })).status).toBe(403);
    expect((await del()).status).toBe(403);
  });

  it('refuses non-images, mismatched types and oversized pictures', async () => {
    expect((await put({ image: 'https://evil.example/x.jpg' })).status).toBe(400);
    expect((await put({ image: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}` })).status).toBe(400);
    // Declared PNG, actually JPEG bytes.
    expect((await put({ image: `data:image/png;base64,${JPEG.toString('base64')}` })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]);
    expect((await put({ image: jpegUri(big) })).status).toBeGreaterThanOrEqual(400);
    expect(Patient.updateOne).not.toHaveBeenCalled();
  });

  it('DELETE unsets the picture', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(Patient.updateOne).toHaveBeenCalledWith({ _id: PATIENT_ID, active: { $ne: false } }, { $unset: { profileImage: 1 } });
  });

  it('checkPhoto accepts PNG and WebP by signature', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);
    expect(checkPhoto(`data:image/png;base64,${png.toString('base64')}`).ok).toBe(true);
    expect(checkPhoto(`data:image/webp;base64,${webp.toString('base64')}`).ok).toBe(true);
  });

  it('PUT is limited per patient record (429), nothing written', async () => {
    photoLimit.limited = true;
    const res = await put({ image: jpegUri() });
    expect(res.status).toBe(429);
    expect(photoLimit.keys).toEqual([`patient-photo:${PATIENT_ID}`]);
    expect(Patient.updateOne).not.toHaveBeenCalled();
  });

  describe('acting for a family member', () => {
    const CHILD = '507f1f77bcf86cd799439044';
    const dob = (dateOfBirth: Date | undefined) =>
      vi.mocked(Patient.findById).mockReturnValue({ select: () => ({ lean: async () => ({ dateOfBirth }) }) } as any);
    const yearsAgo = (n: number) => new Date(Date.UTC(new Date().getUTCFullYear() - n, 0, 1));

    it("may set and remove a minor's picture", async () => {
      vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: CHILD, guardianId: PATIENT_ID, type: 'patient' } as any);
      dob(yearsAgo(8));
      expect((await put({ image: jpegUri() })).status).toBe(200);
      expect((await del()).status).toBe(200);
      expect(photoLimit.keys).toEqual([`patient-photo:${CHILD}`]);
    });

    it("refuses an adult's picture (403 PHOTO_SELF_ONLY), for the family header and guardian-only sessions", async () => {
      dob(yearsAgo(70));
      for (const session of [
        { patientId: CHILD, guardianId: PATIENT_ID, type: 'patient', tid: '507f1f77bcf86cd799439011' },
        { patientId: CHILD, rel: 'guardian', acc: '507f1f77bcf86cd799439055', type: 'patient' },
      ]) {
        vi.mocked(verifyPatientAuth).mockResolvedValue(session as any);
        const putRes = await put({ image: jpegUri() });
        expect(putRes.status).toBe(403);
        expect((await putRes.json()).code).toBe('PHOTO_SELF_ONLY');
        expect((await del()).status).toBe(403);
      }
      expect(Patient.updateOne).not.toHaveBeenCalled();
    });

    it('refuses when the birth date is unknown', async () => {
      vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: CHILD, guardianId: PATIENT_ID, type: 'patient' } as any);
      dob(undefined);
      expect((await put({ image: jpegUri() })).status).toBe(403);
    });
  });
});

describe('GET /api/patients/me picture fields', () => {
  const me = (query = '') => getMe(new NextRequest(`http://localhost/api/patients/me${query}`));
  let selected = '';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    vi.mocked(Patient.findById).mockReturnValue({
      select: (fields: string) => {
        selected = fields;
        const doc: Record<string, unknown> = { _id: PATIENT_ID, firstName: 'Ana', active: true, tenantIds: [], password: 'hash' };
        if (fields.includes('+profileImage')) doc.profileImage = jpegUri();
        return { lean: async () => doc };
      },
    } as any);
    vi.mocked(Patient.exists).mockResolvedValue({ _id: PATIENT_ID } as any);
  });

  it('leaves the picture out by default but says whether there is one', async () => {
    const res = await me();
    const { data } = await res.json();
    expect(selected).not.toContain('profileImage');
    expect(data).not.toHaveProperty('profileImage');
    expect(data.hasProfileImage).toBe(true);
    expect(data.hasPassword).toBe(true);
    expect(data).not.toHaveProperty('password');
    expect(Patient.exists).toHaveBeenCalledWith({ _id: PATIENT_ID, profileImage: { $exists: true, $nin: [null, ''] } });
  });

  it('hasProfileImage false when there is none', async () => {
    vi.mocked(Patient.exists).mockResolvedValue(null);
    const { data } = await (await me()).json();
    expect(data.hasProfileImage).toBe(false);
  });

  it('sends the picture with ?include=photo', async () => {
    const { data } = await (await me('?include=photo')).json();
    expect(selected).toContain('+profileImage');
    expect(data.profileImage).toBe(jpegUri());
    expect(data.hasProfileImage).toBe(true);
    expect(Patient.exists).not.toHaveBeenCalled();
  });

  it('?include=photo with no picture gives profileImage null', async () => {
    vi.mocked(Patient.findById).mockReturnValue({
      select: () => ({ lean: async () => ({ _id: PATIENT_ID, active: true }) }),
    } as any);
    const { data } = await (await me('?include=photo')).json();
    expect(data.profileImage).toBeNull();
    expect(data.hasProfileImage).toBe(false);
  });
});

describe('PATCH /api/patients/me validation message', () => {
  it('puts the first problem, with its field, into error and keeps issues[]', async () => {
    vi.mocked(verifyPatientAuth).mockResolvedValue({ patientId: PATIENT_ID, type: 'patient' } as any);
    const { PATCH } = await import('@/app/api/patients/me/route');
    const res = await PATCH(
      new NextRequest('http://localhost/api/patients/me', {
        method: 'PATCH',
        body: JSON.stringify({ emergencyContact: { phone: 'call me' } }),
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Emergency contact phone: Invalid phone number');
    expect(body.issues).toEqual([{ path: 'emergencyContact.phone', message: 'Invalid phone number' }]);
  });
});
