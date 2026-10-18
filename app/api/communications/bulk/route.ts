import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { isAdmin, refuseAccess } from '@/app/lib/auth-helpers';
import { requireTenantSession, isTenantSessionError, patientTenantFilter } from '@/lib/api/tenant-session';
import { parseBody, isValidationError, zObjectId } from '@/lib/api/validate';
import { escapeHtml } from '@/lib/document-protection';
import { sendSMS } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import { Types } from 'mongoose';

interface BulkCommunicationLog {
  recipientId: Types.ObjectId;
  recipientPhone?: string;
  recipientEmail?: string;
  type: 'sms' | 'email';
  templateId: string;
  variables?: Record<string, string>;
  status: 'queued' | 'sent' | 'failed';
  sentAt?: Date;
  error?: string;
  createdAt: Date;
}

const bulkSchema = z.object({
  type: z.enum(['sms', 'email']),
  recipientIds: z.array(zObjectId).min(1).max(1000),
  template: z.string().trim().min(1).max(5000),
  variables: z
    .record(z.string().regex(/^\w{1,50}$/), z.string().max(1000))
    .refine((v) => Object.keys(v).length <= 50, 'Too many variables')
    .optional(),
  testMode: z.boolean().optional(),
});

function fillTemplate(text: string, variables: Record<string, string>, escape: (s: string) => string) {
  let out = text;
  for (const [key, value] of Object.entries(variables)) {
    out = out.split(`{{${key}}}`).join(escape(value));
  }
  return out;
}

/**
 * POST /api/communications/bulk
 *
 * Send bulk SMS/Email to selected patients of the caller's clinic. Admin only.
 *
 * Request body:
 * {
 *   type: 'sms' | 'email',
 *   recipientIds: string[],
 *   template: string, // custom message with {{variable}} placeholders
 *   variables?: Record<string, string>,
 *   testMode?: boolean // if true, only log, don't actually send
 * }
 */
export async function POST(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  if (!isAdmin(ctx.session)) {
    return refuseAccess(ctx.session, 'Admin access required to send bulk communications');
  }

  const parsed = await parseBody(request, bulkSchema);
  if (isValidationError(parsed)) return parsed;
  const { type, recipientIds, template, variables = {}, testMode = false } = parsed.data;

  try {
    await connectDB();

    const patients = await Patient.find(patientTenantFilter(ctx.tenantId, { _id: { $in: recipientIds } }))
      .select('_id phone email firstName')
      .lean<{ _id: Types.ObjectId; phone?: string; email?: string; firstName?: string }[]>();

    if (patients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No patients found' },
        { status: 404 }
      );
    }

    const logs: BulkCommunicationLog[] = [];
    const results = {
      queued: 0,
      sent: 0,
      failed: 0,
    };

    const smsMessage = fillTemplate(template, variables, (s) => s);
    const emailHtml = fillTemplate(escapeHtml(template), variables, escapeHtml).replace(/\n/g, '<br>');

    for (const patient of patients) {
      let status: 'queued' | 'sent' | 'failed' = 'sent';
      let error: string | undefined;

      try {
        if (!testMode) {
          if (type === 'sms' && patient.phone) {
            const smsResult = await sendSMS({ to: patient.phone, message: smsMessage });
            if (!smsResult.success) {
              console.error('Bulk SMS failed', { patientId: String(patient._id), error: smsResult.error });
              status = 'failed';
              error = 'Delivery failed';
            }
          } else if (type === 'email' && patient.email) {
            const emailResult = await sendEmail({
              to: patient.email,
              subject: 'Clinic Communication',
              html: emailHtml,
            });
            if (!emailResult.success) {
              console.error('Bulk email failed', { patientId: String(patient._id), error: emailResult.error });
              status = 'failed';
              error = 'Delivery failed';
            }
          }
        }
      } catch (err) {
        console.error('Bulk communication error', { patientId: String(patient._id), err });
        status = 'failed';
        error = 'Delivery failed';
      }

      logs.push({
        recipientId: patient._id,
        recipientPhone: patient.phone,
        recipientEmail: patient.email,
        type,
        templateId: template,
        variables,
        status,
        sentAt: status === 'sent' ? new Date() : undefined,
        error,
        createdAt: new Date(),
      });

      results[status]++;
    }

    // TODO: Persist logs to database (create CommunicationLog model)

    return NextResponse.json(
      {
        success: true,
        data: {
          totalRecipients: patients.length,
          results,
          testMode,
          logs: testMode ? logs : [],
        },
      },
      { status: testMode ? 200 : 201 }
    );
  } catch (error) {
    console.error('Error sending bulk communication:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send communications' },
      { status: 500 }
    );
  }
}
