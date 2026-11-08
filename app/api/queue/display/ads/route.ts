import { NextRequest, NextResponse } from 'next/server';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, tenantFilter } from '@/lib/api/tenant-session';
import { isCloudinaryConfigured, ownedUploadOptions, uploadToCloudinary } from '@/lib/cloudinary';
import { getTenantSubdomain } from '@/lib/tenant';
import { checkStorageLimit } from '@/lib/storage-tracking';
import { validateUpload } from '@/lib/upload-validation';
import connectDB from '@/lib/mongodb';
import Settings from '@/models/Settings';

const AD_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Stores one ad image for the waiting-room screen and returns its address. The screen is public,
 * so this is the one upload delivered by a public URL; nothing about a patient belongs here.
 * The ad joins the screen when the settings form is saved. The file is recorded on the clinic's
 * settings (queueSettings.displayAdFiles) so it counts toward storage and is removed from
 * Cloudinary once the clinic stops showing it (app/api/settings/route.ts).
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Unauthorized: Only admins can update settings');
  }
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ success: false, error: 'File storage isn’t set up on this server.' }, { status: 503 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    const check = await validateUpload(file instanceof File ? file : null, { allowed: AD_IMAGE_TYPES });
    if (!check.ok) {
      const error = check.status === 415 ? 'Use a JPEG, PNG or WebP image.' : check.error;
      return NextResponse.json({ success: false, error }, { status: check.status });
    }

    const storage = await checkStorageLimit(ctx.tenantId, check.buffer.length);
    if (!storage.allowed) {
      return NextResponse.json({ success: false, error: storage.reason || 'Storage limit exceeded' }, { status: 403 });
    }

    const tenantSlug = await getTenantSubdomain(ctx.tenantId);
    const uploaded = await uploadToCloudinary(check.buffer, {
      ...ownedUploadOptions({ tenantId: ctx.tenantId, tenantSlug }, 'display-ads'),
      resourceType: 'image',
      deliveryType: 'upload',
      // A TV never needs more than this, and it plays over the clinic's own connection.
      transformation: [{ width: 1920, height: 1080, crop: 'limit', quality: 'auto' }],
    });
    if (!uploaded.success || !uploaded.data) {
      return NextResponse.json({ success: false, error: 'The image could not be stored.' }, { status: 502 });
    }

    // Not a settings change, so the settings version (updatedAt) the open form holds stays valid.
    await connectDB();
    await Settings.updateOne(
      tenantFilter(ctx.tenantId),
      { $push: { 'queueSettings.displayAdFiles': { url: uploaded.data.secure_url, bytes: uploaded.data.bytes, uploadedAt: new Date() } } },
      { timestamps: false }
    );

    return NextResponse.json({ success: true, data: { url: uploaded.data.secure_url } });
  } catch (error) {
    console.error('Error uploading queue display ad:', error);
    return NextResponse.json({ success: false, error: 'The image could not be stored.' }, { status: 500 });
  }
}
