import { NextRequest, NextResponse } from 'next/server';
import { processConfirmationResponse } from '@/lib/automations/appointment-confirmation';
import connectDB from '@/lib/mongodb';
import Appointment from '@/models/Appointment';
import { Types } from 'mongoose';

/**
 * Public endpoint for appointment confirmation
 * Allows patients to confirm/cancel/reschedule appointments via link
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get('id') || searchParams.get('appointmentId');
    const code = searchParams.get('code');
    const action = searchParams.get('action'); // 'yes', 'no', 'reschedule'

    if (!appointmentId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Validate action
    if (!['yes', 'no', 'reschedule'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Get appointment to verify code (if provided)
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Verify confirmation code if provided
    if (code) {
      const expectedCode = appointment.appointmentCode 
        ? appointment.appointmentCode.substring(0, 6).toUpperCase()
        : appointment._id.toString().substring(0, 6).toUpperCase();
      
      if (code.toUpperCase() !== expectedCode) {
        return NextResponse.json(
          { success: false, error: 'Invalid confirmation code' },
          { status: 401 }
        );
      }
    }

    // Process confirmation
    const result = await processConfirmationResponse(
      appointmentId,
      action as 'yes' | 'no' | 'reschedule',
      appointment.tenantId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Return success page (HTML)
    const statusMessage = result.status === 'confirmed' 
      ? 'Your appointment has been confirmed!'
      : result.status === 'cancelled'
      ? 'Your appointment has been cancelled.'
      : 'Your rescheduling request has been received. We will contact you shortly.';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; text-align: center; padding: 50px; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
          .success { color: #4CAF50; font-size: 24px; font-weight: bold; }
          .message { margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✓ Success</div>
          <div class="message">${statusMessage}</div>
          <p>You can close this window.</p>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (error: any) {
    console.error('Error processing appointment confirmation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process confirmation' },
      { status: 500 }
    );
  }
}

