import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import Notification from '@/models/Notification';
import User from '@/models/User';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter, tenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { escapeHtml } from '@/lib/document-protection';
import { sendSMS } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import { sanitizeSearch } from '@/lib/utils';

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  channels: z.array(z.enum(['sms', 'email', 'in-app'])).min(1).max(3),
  filters: z
    .object({
      ageGroup: z.string().max(50).optional(),
      city: z.string().trim().max(100).optional(),
      hasInsurance: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Admin access required to send broadcasts');
  }

  const parsed = await parseBody(request, broadcastSchema);
  if (isValidationError(parsed)) return parsed;
  const { title, message, channels, filters } = parsed.data;

  try {
    await connectDB();

    const patientQuery: Record<string, unknown> = patientTenantFilter(ctx.tenantId);
    if (filters) {
      if (filters.city) {
        patientQuery['address.city'] = { $regex: sanitizeSearch(filters.city), $options: 'i' };
      }
      if (filters.hasInsurance) {
        patientQuery.$or = [
          { 'identifiers.philHealth': { $exists: true, $ne: null } },
          { 'identifiers.other': { $exists: true, $ne: null } },
        ];
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

    const safeTitle = escapeHtml(title);
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

    for (const patient of patients) {
      const patientName = `${patient.firstName} ${patient.lastName}`;
      try {
        if (channels.includes('sms') && patient.phone) {
          const smsResult = await sendSMS({
            to: patient.phone,
            message: `${title}\n\n${message}`,
          });
          if (smsResult.success) {
            results.smsSent++;
          } else {
            console.error('Broadcast SMS failed', { patientId: String(patient._id), error: smsResult.error });
            results.errors.push(`SMS failed for ${patientName}`);
          }
        }

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
                    <h1>${safeTitle}</h1>
                  </div>
                  <div class="content">
                    <p>Dear ${escapeHtml(patientName)},</p>
                    <div class="message">
                      ${safeMessage}
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
            console.error('Broadcast email failed', { patientId: String(patient._id), error: emailResult.error });
            results.errors.push(`Email failed for ${patientName}`);
          }
        }

        if (channels.includes('in-app') && patient.email) {
          // Only notify a linked user account in this clinic.
          const user = await User.findOne(tenantFilter(ctx.tenantId, { email: patient.email })).select('_id');
          if (user) {
            await Notification.create({
              tenantId: ctx.tenantObjectId,
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
      } catch (error) {
        console.error('Broadcast processing error', { patientId: String(patient._id), error });
        results.errors.push(`Error processing ${patientName}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `Broadcast sent to ${patients.length} patients`,
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send broadcast' },
      { status: 500 }
    );
  }
}
