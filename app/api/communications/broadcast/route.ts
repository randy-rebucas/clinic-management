import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getUserByEmail } from '@/lib/data/user';
import { createNotification } from '@/lib/data/notification';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';
import { getTenantContext } from '@/lib/tenant';
import { sendSMS } from '@/lib/sms';
import { sendEmail } from '@/lib/email';
import { sanitizeSearch } from '@/lib/utils';
import { Prisma } from '@prisma/client';

function run<T>(tenantId: string | null | undefined, fn: () => T | Promise<T>) {
  return tenantId ? runWithTenant(tenantId, fn) : runAsSystem(fn);
}

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

    const tenantContext = await getTenantContext();
    const tenantId = session.tenantId || tenantContext.tenantId;

    // Build patient query based on filters
    const patientQuery: Prisma.PatientWhereInput = {};
    if (filters) {
      if (filters.ageGroup) {
        // Age group filtering would require date calculation
        // For now, we'll skip complex age filtering
      }
      if (filters.city) {
        patientQuery.addressCity = { contains: sanitizeSearch(filters.city), mode: 'insensitive' };
      }
      if (filters.hasInsurance !== undefined) {
        if (filters.hasInsurance) {
          patientQuery.OR = [
            { identifierPhilHealth: { not: null } },
            { identifierOther: { not: Prisma.JsonNull } },
          ];
        }
      }
    }

    const results = {
      totalPatients: 0,
      smsSent: 0,
      emailSent: 0,
      inAppCreated: 0,
      errors: [] as string[],
    };

    await run(tenantId, async () => {
      const patients = await prisma.patient.findMany({
        where: patientQuery,
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      });

      results.totalPatients = patients.length;

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
            const user = patient.email ? await getUserByEmail(patient.email) : null;

            if (user) {
              await createNotification({
                userId: user.id,
                type: 'broadcast',
                priority: 'normal',
                title,
                message,
              });
              results.inAppCreated++;
            }
          }
        } catch (error: any) {
          results.errors.push(`Error processing ${patient.firstName} ${patient.lastName}: ${error.message}`);
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: results,
      message: `Broadcast sent to ${results.totalPatients} patients`,
    });
  } catch (error: any) {
    console.error('Error sending broadcast:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send broadcast' },
      { status: 500 }
    );
  }
}
