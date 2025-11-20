import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse } from '@/app/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const body = await request.json();
    const { visitId } = body;

    if (!visitId) {
      return NextResponse.json(
        { success: false, error: 'Visit ID required' },
        { status: 400 }
      );
    }

    const visit = await Visit.findById(visitId).populate('patient', 'firstName lastName email phone');
    if (!visit) {
      return NextResponse.json(
        { success: false, error: 'Visit not found' },
        { status: 404 }
      );
    }

    if (!visit.followUpDate) {
      return NextResponse.json(
        { success: false, error: 'No follow-up date set for this visit' },
        { status: 400 }
      );
    }

    // Send reminder email/SMS
    const patient = visit.patient as any;
    console.log('Sending follow-up reminder:', {
      to: patient.email,
      patient: `${patient.firstName} ${patient.lastName}`,
      followUpDate: visit.followUpDate.toLocaleDateString(),
    });

    // TODO: Implement actual email/SMS sending
    // Example:
    // await sendEmail({
    //   to: patient.email,
    //   subject: 'Follow-up Appointment Reminder',
    //   body: `Dear ${patient.firstName}, your follow-up appointment is scheduled for ${visit.followUpDate.toLocaleDateString()}...`
    // });

    // Update reminder sent flag
    visit.followUpReminderSent = true;
    await visit.save();

    return NextResponse.json({
      success: true,
      message: 'Follow-up reminder sent successfully',
    });
  } catch (error: any) {
    console.error('Error sending reminder:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send reminder' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await verifySession();

  if (!session) {
    return unauthorizedResponse();
  }

  try {
    await connectDB();
    const searchParams = request.nextUrl.searchParams;
    const daysAhead = parseInt(searchParams.get('daysAhead') || '7');

    // Find visits with follow-up dates in the next N days that haven't had reminders sent
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const visitsNeedingReminders = await Visit.find({
      followUpDate: { $gte: today, $lte: futureDate },
      followUpReminderSent: { $ne: true },
      status: { $ne: 'cancelled' },
    })
      .populate('patient', 'firstName lastName email phone')
      .populate('provider', 'name email');

    return NextResponse.json({
      success: true,
      data: visitsNeedingReminders,
      count: visitsNeedingReminders.length,
    });
  } catch (error: any) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reminders' },
      { status: 500 }
    );
  }
}

