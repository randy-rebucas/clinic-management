import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Notification from '@/models/Notification';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { sendSMS } from '@/lib/sms';
import { sendEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  // Only admin can send broadcast messages
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    await connectDB();
    const body = await request.json();
    const {
      title,
      message,
      channels, // ['sms', 'email', 'in-app'] or combination
      filters, // { ageGroup, city, hasInsurance, etc. }
    } = body;

    if (!title || !message || !channels || channels.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Title, message, and at least one channel required' },
        { status: 400 }
      );
    }

    // Build patient query based on filters
    let patientQuery: any = {};
    if (filters) {
      if (filters.ageGroup) {
        // Age group filtering would require date calculation
        // For now, we'll skip complex age filtering
      }
      if (filters.city) {
        patientQuery['address.city'] = { $regex: filters.city, $options: 'i' };
      }
      if (filters.hasInsurance !== undefined) {
        if (filters.hasInsurance) {
          patientQuery.$or = [
            { 'identifiers.philHealth': { $exists: true, $ne: null } },
            { 'identifiers.other': { $exists: true, $ne: null } },
          ];
        }
      }
    }

    const patients = await Patient.find(patientQuery).select('_id firstName lastName email phone');

    const results = {
      totalPatients: patients.length,
      smsSent: 0,
      emailSent: 0,
      inAppCreated: 0,
      errors: [] as string[],
    };

    // Send messages to each patient
    for (const patient of patients) {
      try {
        // SMS
        if (channels.includes('sms') && patient.phone) {
          let phoneNumber = patient.phone.trim();
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = `+1${phoneNumber.replace(/\D/g, '')}`;
          }
          const smsResult = await sendSMS({
            to: phoneNumber,
            message: `${title}\n\n${message}`,
          });
          if (smsResult.success) {
            results.smsSent++;
          } else {
            results.errors.push(`SMS failed for ${patient.firstName} ${patient.lastName}: ${smsResult.error}`);
          }
        }

        // Email
        if (channels.includes('email') && patient.email) {
          const emailResult = await sendEmail({
            to: patient.email,
            subject: title,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                  .content { padding: 20px; background-color: #f9f9f9; }
                  .message { background-color: white; padding: 15px; margin: 10px 0; }
                  .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>${title}</h1>
                  </div>
                  <div class="content">
                    <p>Dear ${patient.firstName} ${patient.lastName},</p>
                    <div class="message">
                      ${message.replace(/\n/g, '<br>')}
                    </div>
                  </div>
                  <div class="footer">
                    <p>This is an automated message from your clinic.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });
          if (emailResult.success) {
            results.emailSent++;
          } else {
            results.errors.push(`Email failed for ${patient.firstName} ${patient.lastName}: ${emailResult.error}`);
          }
        }

        // In-app notification
        if (channels.includes('in-app')) {
          // Find user account for this patient (if linked)
          const User = (await import('@/models/User')).default;
          const user = await User.findOne({ email: patient.email }).select('_id');
          
          if (user) {
            await Notification.create({
              user: user._id,
              type: 'broadcast',
              priority: 'normal',
              title,
              message,
              read: false,
            });
            results.inAppCreated++;
          }
        }
      } catch (error: any) {
        results.errors.push(`Error processing ${patient.firstName} ${patient.lastName}: ${error.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `Broadcast sent to ${patients.length} patients`,
    });
  } catch (error: any) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send broadcast' },
      { status: 500 }
    );
  }
}

