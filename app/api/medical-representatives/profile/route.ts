import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { verifySession } from '@/app/lib/dal';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * PUT /api/medical-representatives/profile
 * Update medical representative profile information
 *
 * NOTE: `profileImage` had no corresponding column on the Mongoose schema
 * either (models/MedicalRepresentative.ts has no `profileImage` field), so
 * that assignment was already a silent no-op. Preserved as a no-op here.
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

    const stringField = (val: unknown) => (typeof val === 'string' && val.trim() ? val.trim() : undefined);

    const result = await run(session.tenantId, async () => {
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!user) return null;

      const medicalRep = user.medicalRepresentativeProfileId
        ? await prisma.medicalRepresentative.findUnique({ where: { id: user.medicalRepresentativeProfileId } })
        : await prisma.medicalRepresentative.findFirst({ where: { email: user.email.toLowerCase().trim() } });

      if (!medicalRep) return null;

      // Update allowed fields only
      const data: Record<string, unknown> = {};
      if (stringField(body.firstName)) data.firstName = stringField(body.firstName)!;
      if (stringField(body.lastName)) data.lastName = stringField(body.lastName)!;
      if (stringField(body.phone)) data.phone = stringField(body.phone)!;
      if (stringField(body.company)) data.company = stringField(body.company)!;
      if (body.bio !== undefined) data.bio = stringField(body.bio) ?? '';
      if (body.territory !== undefined) data.territory = stringField(body.territory) ?? '';
      if (body.title !== undefined) data.title = stringField(body.title) ?? '';
      // NOTE: profileImage intentionally unapplied — see comment above.

      const updated = await prisma.medicalRepresentative.update({
        where: { id: medicalRep.id },
        data: data as any,
      });

      const { internalNotes: _internalNotes, paymentStatus, paymentDate, paymentAmount, paymentMethod, paymentReference, ...rest } = updated as any;
      void paymentStatus; void paymentDate; void paymentAmount; void paymentMethod; void paymentReference;
      return rest;
    });

    if (!result) {
      return NextResponse.json({ success: false, error: 'Medical representative not found' }, { status: 404 });
    }

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
