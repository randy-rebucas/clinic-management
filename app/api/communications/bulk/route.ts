import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, requirePermission } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
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

/**
 * POST /api/communications/bulk
 *
 * Send bulk SMS/Email to filtered patient groups
 *
 * Request body:
 * {
 *   type: 'sms' | 'email',
 *   recipientIds: string[],
 *   template: string, // template name or custom message
 *   variables?: Record<string, string>, // for template substitution
 *   testMode?: boolean // if true, only log, don't actually send
 * }
 */
export async function POST(request: NextRequest) {
  const session = await verifySession();
  if (!session) return unauthorizedResponse();

  const permissionCheck = await requirePermission(session, 'patients', 'write');
  if (permissionCheck) return permissionCheck;

  try {
    await connectDB();

    const body = await request.json();
    const { type, recipientIds = [], template, variables = {}, testMode = false } = body;

    if (!['sms', 'email'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Type must be sms or email' },
        { status: 400 }
      );
    }

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'recipientIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!template || typeof template !== 'string') {
      return NextResponse.json({ success: false, error: 'Template is required' }, { status: 400 });
    }

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Fetch patients
    const query: any = {
      _id: { $in: recipientIds.map((id) => new Types.ObjectId(id)) },
    };

    if (tenantId) {
      query.tenantIds = tenantId;
    }

    const patients = await Patient.find(query).select('_id phone email firstName').lean();

    if (patients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No patients found' },
        { status: 404 }
      );
    }

    // Prepare communication logs
    const logs: BulkCommunicationLog[] = [];
    const results = {
      queued: 0,
      sent: 0,
      failed: 0,
    };

    // Process sends
    for (const patient of patients) {
      try {
        let status: 'queued' | 'sent' | 'failed' = 'sent';
        let error: string | undefined;

        if (!testMode) {
          if (type === 'sms' && patient.phone) {
            try {
              // Substitute variables in message
              let message = template;
              for (const [key, value] of Object.entries(variables)) {
                message = message.replace(`{{${key}}}`, String(value));
              }
              await sendSMS({ to: patient.phone, message });
            } catch (err) {
              status = 'failed';
              error = String(err);
            }
          } else if (type === 'email' && patient.email) {
            try {
              // Substitute variables
              let subject = 'Clinic Communication';
              let body = template;
              for (const [key, value] of Object.entries(variables)) {
                subject = subject.replace(`{{${key}}}`, String(value));
                body = body.replace(`{{${key}}}`, String(value));
              }
              await sendEmail({
                to: patient.email,
                subject,
                html: body,
              });
            } catch (err) {
              status = 'failed';
              error = String(err);
            }
          }
        }

        logs.push({
          recipientId: patient._id as Types.ObjectId,
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
      } catch (err) {
        logs.push({
          recipientId: patient._id as Types.ObjectId,
          recipientPhone: patient.phone,
          recipientEmail: patient.email,
          type,
          templateId: template,
          variables,
          status: 'failed',
          error: String(err),
          createdAt: new Date(),
        });
        results.failed++;
      }
    }

    // TODO: Persist logs to database (create CommunicationLog model)

    return NextResponse.json(
      {
        success: true,
        data: {
          totalRecipients: patients.length,
          results,
          testMode,
          logs: testMode ? logs : [], // Include logs for test mode
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
