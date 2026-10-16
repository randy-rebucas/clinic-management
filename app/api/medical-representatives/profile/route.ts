import { NextRequest, NextResponse } from 'next/server';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * PUT /api/medical-representatives/profile
 * Update medical representative profile information
 */
export async function PUT(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Validate profileImage if provided
    if (body.profileImage !== undefined && body.profileImage !== null) {
      if (typeof body.profileImage !== 'string') {
        return NextResponse.json({ success: false, error: 'Invalid profile image.' }, { status: 400 });
      }
      // Expect data URI: data:<mime>;base64,<data>
      const match = body.profileImage.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        return NextResponse.json({ success: false, error: 'Profile image must be a base64 data URI.' }, { status: 400 });
      }
      const mimeType = match[1];
      const base64Data = match[2];
      if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        return NextResponse.json(
          { success: false, error: 'Profile image must be JPEG, PNG, GIF, or WebP.' },
          { status: 400 }
        );
      }
      const byteLength = Math.ceil((base64Data.length * 3) / 4);
      if (byteLength > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { success: false, error: 'Profile image must be 2 MB or smaller.' },
          { status: 400 }
        );
      }
    }

    const tooLong = (val: unknown, max: number) => typeof val === 'string' && val.length > max;
    if (
      tooLong(body.firstName, 100) || tooLong(body.lastName, 100) || tooLong(body.phone, 30) ||
      tooLong(body.company, 200) || tooLong(body.territory, 200) || tooLong(body.title, 20) ||
      tooLong(body.bio, 2000)
    ) {
      return NextResponse.json(
        { success: false, error: 'One or more fields exceed the maximum allowed length.' },
        { status: 400 }
      );
    }

    await connectDB();

    const repFilter: Record<string, unknown> = { userId: rep.userObjectId };
    if (rep.ownerFilter.tenantId) repFilter.tenantIds = rep.ownerFilter.tenantId;
    const medicalRep = await MedicalRepresentative.findOne(repFilter);

    if (!medicalRep) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

    // Update allowed fields only
    const stringField = (val: unknown) => (typeof val === 'string' && val.trim() ? val.trim() : undefined);

    if (stringField(body.firstName)) medicalRep.firstName = stringField(body.firstName)!;
    if (stringField(body.lastName)) medicalRep.lastName = stringField(body.lastName)!;
    if (stringField(body.phone)) medicalRep.phone = stringField(body.phone)!;
    if (stringField(body.company)) medicalRep.company = stringField(body.company)!;
    if (body.bio !== undefined) medicalRep.bio = stringField(body.bio) ?? '';
    if (body.territory !== undefined) medicalRep.territory = stringField(body.territory) ?? '';
    if (body.title !== undefined) medicalRep.title = stringField(body.title) ?? '';
    if (body.profileImage !== undefined) medicalRep.profileImage = body.profileImage as string | null;

    await medicalRep.save();

    const result = medicalRep.toObject();
    delete result.internalNotes;
    delete result.paymentStatus;
    delete result.paymentDate;
    delete result.paymentAmount;
    delete result.paymentMethod;
    delete result.paymentReference;
    delete result.password;

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('Update profile error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
