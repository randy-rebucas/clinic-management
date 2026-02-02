import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import { sendEmail } from '@/lib/email';

export interface SupportRequest {
  subject: string;
  category: 'general' | 'technical' | 'billing' | 'account' | 'onboarding' | 'other';
  message: string;
  email: string;
  userId?: string;
}

/**
 * POST /api/medical-representatives/support
 * Submit a support request from medical representative
 */
export async function POST(request: NextRequest) {
  try {
    // Get request body
    let body: SupportRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body. Expected JSON.' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.email || !body.subject || !body.message) {
      return NextResponse.json(
        { success: false, error: 'Email, subject, and message are required.' },
        { status: 400 }
      );
    }

    // Verify session (optional, but recommended)
    const session = await verifySession();
    const userId = session?.userId;

    await connectDB();

    // Log the support request (you could save this to a database)
    console.log('Medical representative support request received:', {
      email: body.email,
      subject: body.subject,
      category: body.category,
      userId,
      timestamp: new Date().toISOString(),
    });

    // Send email notification to support team
    try {
      await sendEmail({
        to: 'support@myclinicsoft.com',
        cc: body.email,
        subject: `Support Request: ${body.subject}`,
        html: `
          <h2>New Support Request</h2>
          <p><strong>From:</strong> ${body.email}</p>
          <p><strong>Category:</strong> ${body.category}</p>
          <p><strong>Subject:</strong> ${body.subject}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${body.message.replace(/\n/g, '<br>')}</p>
          ${userId ? `<p><strong>User ID:</strong> ${userId}</p>` : ''}
        `,
      });
    } catch (emailError) {
      console.error('Error sending support email:', emailError);
      // Don't fail the request if email fails - still log the support request
    }

    return NextResponse.json({
      success: true,
      message: 'Support request submitted successfully. We will get back to you soon.',
      reference: `SR-${Date.now()}`,
    });
  } catch (error: any) {
    console.error('Support request error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
