import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import { sendEmail } from '@/lib/email';
import SupportRequestModel from '@/models/SupportRequest';

const VALID_CATEGORIES = ['general', 'technical', 'billing', 'account', 'onboarding', 'other'] as const;
type SupportCategory = typeof VALID_CATEGORIES[number];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * POST /api/medical-representatives/support
 * Submit a support request from medical representative
 */
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session || session.role !== 'medical-representative') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { subject?: unknown; category?: unknown; message?: unknown; email?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : 'general';

    if (!email || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'Email, subject, and message are required.' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'Invalid email address.' }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category as SupportCategory)) {
      return NextResponse.json({ success: false, error: 'Invalid category.' }, { status: 400 });
    }

    if (subject.length > 200) {
      return NextResponse.json({ success: false, error: 'Subject must be 200 characters or fewer.' }, { status: 400 });
    }

    if (message.length > 5000) {
      return NextResponse.json({ success: false, error: 'Message must be 5000 characters or fewer.' }, { status: 400 });
    }

    await connectDB();

    const supportRequest = await SupportRequestModel.create({
      tenantId: session.tenantId,
      userId: session.userId,
      email,
      subject,
      category,
      message,
      status: 'open',
    });

    // Send email notification to support team
    try {
      await sendEmail({
        to: 'support@myclinicsoft.com',
        subject: `Support Request: ${escapeHtml(subject)}`,
        html: `
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${escapeHtml(email)}</p>
          <p><strong>Category:</strong> ${escapeHtml(category)}</p>
          <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
          <p><strong>User ID:</strong> ${escapeHtml(String(session.userId))}</p>
        `,
      });
    } catch (emailError) {
      console.error('Error sending support email:', emailError);
      // Don't fail the request if email fails - still log the support request
    }

    return NextResponse.json({
      success: true,
      message: 'Support request submitted successfully. We will get back to you soon.',
      reference: `SR-${supportRequest._id}`,
    });
  } catch (error: any) {
    console.error('Support request error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
