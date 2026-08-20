import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendSMS } from '@/lib/sms';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { createLabResultNotification } from '@/lib/notifications';
import { getTenantContext } from '@/lib/tenant';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getLabResultById, updateLabResult } from '@/lib/data/lab-result';

function run<T>(tenantId: string | null, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const notificationMethod = body.method || 'email'; // 'email', 'sms', or 'both'

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    const labResult = await run(tenantId, () => getLabResultById(id));

    if (!labResult) {
      return NextResponse.json({ success: false, error: 'Lab result not found' }, { status: 404 });
    }

    const patient = labResult.patient as any;

    if (!patient.email && !patient.phone) {
      return NextResponse.json({ success: false, error: 'Patient contact information not available' }, { status: 400 });
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
            results.errors.push(`Email failed: ${emailResult.error}`);
          }
        } catch (error: any) {
          results.errors.push(`Email failed: ${error.message}`);
        }
      } else {
        results.errors.push('Patient email not available');
      }
    }

    if (notificationMethod === 'sms' || notificationMethod === 'both') {
      if (patient.phone) {
        try {
          const message = `Your lab results for ${labResult.request.testType} are now available. Request Code: ${labResult.requestCode}. Please contact the clinic to view your results.`;

          let phoneNumber = patient.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const smsResult = await sendSMS({ to: phoneNumber, message });

          if (smsResult.success) {
            results.smsSent = true;
          } else {
            results.errors.push(`SMS failed: ${smsResult.error}`);
          }
        } catch (error: any) {
          results.errors.push(`SMS failed: ${error.message}`);
        }
      } else {
        results.errors.push('Patient phone not available');
      }
    }

    // Update notification status on LabResult (in scope for this batch)
    await run(tenantId, () =>
      updateLabResult(id, {
        notificationSent: results.emailSent || results.smsSent,
        notificationSentAt: new Date(),
        notificationMethod: notificationMethod as any,
      })
    );

    // Create in-app notification if patient has a user account.
    // NOTE: Notification is out of scope for this batch (owned by the later
    // "supporting models"/Notification batch) — the User lookup + Mongoose
    // createLabResultNotification() call stays on Mongoose exactly as
    // before.
    try {
      const connectDB = (await import('@/lib/mongodb')).default;
      await connectDB();
      const User = (await import('@/models/User')).default;
      const user = await User.findOne({ email: patient.email }).select('_id');
      if (user) {
        await createLabResultNotification(user._id, labResult);
      }
    } catch (error: any) {
      console.error('Error creating in-app notification:', error);
    }

    return NextResponse.json({
      success: results.emailSent || results.smsSent,
      data: results,
    });
  } catch (error: any) {
    console.error('Error sending lab result notification:', error);
    return NextResponse.json({ success: false, error: 'Failed to send notification' }, { status: 500 });
  }
}
