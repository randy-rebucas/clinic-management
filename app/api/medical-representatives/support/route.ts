import { NextRequest, NextResponse } from 'next/server';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
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
 * GET /api/medical-representatives/support
 * The rep's own support requests, newest first.
 * Query params: page (default 1), limit (default 20, max 50)
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20));

    await connectDB();

    const [requests, total] = await Promise.all([
      SupportRequestModel.find(rep.ownerFilter)
        .select('email subject category message status replies createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportRequestModel.countDocuments(rep.ownerFilter),
    ]);

    return NextResponse.json({
      success: true,
      data: requests.map((r: any) => ({ ...r, reference: `SR-${r._id}` })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error('List support requests error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medical-representatives/support
 * Submit a support request. Body: { subject, message, category?, email? }
 * `email` (reply-to) defaults to the signed-in rep's email.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;
    const { session } = rep;

    let body: { subject?: unknown; category?: unknown; message?: unknown; email?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }

    const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : session.email;
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
      ...rep.ownerFilter,
      email,
      subject,
      category,
      message,
      status: 'open',
      source: 'medical-rep',
      lastActivityAt: new Date(),
      lastReplyBy: 'requester',
    });

    // Send email notification to support team
    try {
      await sendEmail({
        to: 'support@myclinicsoft.solutions',
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
