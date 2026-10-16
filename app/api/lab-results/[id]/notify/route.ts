import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { sendSMS } from '@/lib/sms';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { createLabResultNotification } from '@/lib/notifications';
import { requireTenantSession, isTenantSessionError, isValidId, notFound, tenantFilter } from '@/lib/api/tenant-session';
import { normalizePhone } from '@/lib/phone';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;
  const { session, tenantId, tenantObjectId } = ctx;

  const permissionCheck = await requirePermission(session, 'lab-results', 'update');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();
    const { id } = await params;
    if (!isValidId(id)) return notFound('Lab result');

    const body = await request.json().catch(() => ({}));
    const notificationMethod: 'email' | 'sms' | 'both' =
      body?.method === 'sms' || body?.method === 'both' ? body.method : 'email';

    const labResult = await LabResult.findOne(tenantFilter(tenantId, { _id: id }))
      .populate({ path: 'patient', select: 'firstName lastName email phone', match: { tenantIds: tenantObjectId } })
      .populate({ path: 'visit', select: 'visitCode date', match: { tenantId: tenantObjectId } });

    if (!labResult) return notFound('Lab result');

    const patient = labResult.patient as any;

    if (!patient || (!patient.email && !patient.phone)) {
      return NextResponse.json(
        { success: false, error: 'Patient contact information not available' },
        { status: 400 }
      );
    }

    const results = {
      emailSent: false,
      smsSent: false,
      errors: [] as string[],
    };

    if (notificationMethod === 'email' || notificationMethod === 'both') {
      if (patient.email) {
        try {
          const emailContent = generateLabResultEmail(labResult);
          const emailResult = await sendEmail({
            to: patient.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });

          if (emailResult.success) {
            results.emailSent = true;
          } else {
            results.errors.push('Email failed to send');
          }
        } catch (error: any) {
          console.error('Lab result email failed:', error);
          results.errors.push('Email failed to send');
        }
      } else {
        results.errors.push('Patient email not available');
      }
    }

    if (notificationMethod === 'sms' || notificationMethod === 'both') {
      const phoneNumber = patient.phone ? normalizePhone(patient.phone) : null;
      if (phoneNumber) {
        try {
          const message = `Your lab results for ${labResult.request.testType} are now available. Request Code: ${labResult.requestCode}. Please contact the clinic to view your results.`;
          const smsResult = await sendSMS({ to: phoneNumber, message });

          if (smsResult.success) {
            results.smsSent = true;
          } else {
            results.errors.push('SMS failed to send');
          }
        } catch (error: any) {
          console.error('Lab result SMS failed:', error);
          results.errors.push('SMS failed to send');
        }
      } else {
        results.errors.push('Patient phone not available');
      }
    }

    labResult.notificationSent = results.emailSent || results.smsSent;
    labResult.notificationSentAt = new Date();
    labResult.notificationMethod = notificationMethod;
    await labResult.save();

    // In-app notification for a user account at this clinic with the patient's email
    if (patient.email) {
      try {
        const User = (await import('@/models/User')).default;
        const user = await User.findOne({ email: patient.email, tenantId: tenantObjectId }).select('_id');
        if (user) {
          await createLabResultNotification(user._id, labResult);
        }
      } catch (error: any) {
        console.error('Error creating in-app notification:', error);
      }
    }

    return NextResponse.json({
      success: results.emailSent || results.smsSent,
      data: results,
    });
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
