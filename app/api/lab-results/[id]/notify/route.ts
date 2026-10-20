import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { requirePermission } from '@/app/lib/auth-helpers';
import { sendSMS } from '@/lib/sms';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
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

    const sent = results.emailSent || results.smsSent;
    // Only a message that actually went out is recorded; a failed attempt must not read as "patient told".
    if (sent) {
      labResult.notificationSent = true;
      labResult.notificationSentAt = new Date();
      labResult.notificationMethod = results.emailSent && results.smsSent ? 'both' : results.smsSent ? 'sms' : 'email';
      await labResult.save();
    }

    // The patient app already lists the result (its feed is built from lab results); push it to
    // the patient's phone so they know. Staff accounts are never involved.
    try {
      const { sendPushToPatientDevices } = await import('@/lib/push-notifications');
      await sendPushToPatientDevices(
        String(patient._id),
        { title: 'Lab result available', body: `Your ${labResult.request.testType} result is ready.`, tag: `lab-result-${labResult._id}` },
        { tenantId: tenantObjectId }
      );
    } catch (error: any) {
      console.error('Lab result push failed:', error);
    }

    return NextResponse.json({
      success: sent,
      data: results,
      ...(sent ? {} : { error: results.errors.join('. ') || 'Nothing was sent' }),
    });
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}
