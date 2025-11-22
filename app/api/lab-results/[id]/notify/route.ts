import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import LabResult from '@/models/LabResult';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendSMS } from '@/lib/sms';
import { sendEmail, generateLabResultEmail } from '@/lib/email';
import { createLabResultNotification } from '@/lib/notifications';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();
    const notificationMethod = body.method || 'email'; // 'email', 'sms', or 'both'

    const labResult = await LabResult.findById(id)
      .populate('patient', 'firstName lastName email phone')
      .populate('visit', 'visitCode date');

    if (!labResult) {
      return NextResponse.json(
        { success: false, error: 'Lab result not found' },
        { status: 404 }
      );
    }

    const patient = labResult.patient as any;

    if (!patient.email && !patient.phone) {
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

    // Send email notification
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

    // Send SMS notification
    if (notificationMethod === 'sms' || notificationMethod === 'both') {
      if (patient.phone) {
        try {
          const message = `Your lab results for ${labResult.request.testType} are now available. Request Code: ${labResult.requestCode}. Please contact the clinic to view your results.`;

          let phoneNumber = patient.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }

          const smsResult = await sendSMS({
            to: phoneNumber,
            message,
          });

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

    // Update notification status
    labResult.notificationSent = results.emailSent || results.smsSent;
    labResult.notificationSentAt = new Date();
    labResult.notificationMethod = notificationMethod as any;
    await labResult.save();

    // Create in-app notification if patient has a user account
    try {
      const User = (await import('@/models/User')).default;
      const user = await User.findOne({ email: patient.email }).select('_id');
      if (user) {
        await createLabResultNotification(user._id, labResult);
      }
    } catch (error: any) {
      console.error('Error creating in-app notification:', error);
      // Don't fail the whole request if notification creation fails
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

