import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
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
    const session = await verifySession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

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

    await connectDB();

    const medicalRep = await MedicalRepresentative.findOne({
      userId: session.userId,
      tenantIds: session.tenantId,
    });

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
