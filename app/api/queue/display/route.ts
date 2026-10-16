import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import '@/models/Room';
import { verifySession } from '@/app/lib/dal';
import { getTenantContext } from '@/lib/tenant';
import { Types } from 'mongoose';
import { getSettings } from '@/lib/settings';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { formatInTz } from '@/lib/tz';
import { escapeHtml as e } from '@/lib/document-protection';
import { QUEUE_SORT } from '@/lib/queue-order';

/** "Juan Dela Cruz" -> "J. D. C." so the public screen never shows full names. */
function initials(name: unknown): string {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0].toUpperCase()}.`)
    .join(' ');
}

/**
 * Queue display screen (for a TV monitor in the waiting room).
 *
 * Shown on the clinic's subdomain only. Anonymous viewers see it only when the clinic
 * enabled queueSettings.displayQueuePublicly; signed-in staff of the clinic always can.
 * Patients are shown by initials and queue number only.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const tenantContext = await getTenantContext();
    const tenantId = tenantContext.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Clinic not found' }, { status: 404 });
    }

    const settings = await getSettings(tenantId);
    if (!settings?.queueSettings?.displayQueuePublicly) {
      const session = await verifySession();
      if (!session || session.tenantId !== tenantId) {
        return NextResponse.json({ success: false, error: 'Queue display is not enabled' }, { status: 403 });
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const doctorId = searchParams.get('doctorId');
    const roomId = searchParams.get('roomId');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 50);
    const tenantObjectId = new Types.ObjectId(tenantId);

    const query: any = {
      tenantId: tenantObjectId,
      status: { $in: ['waiting', 'in-progress'] },
      checkedIn: true, // Only show checked-in patients
    };
    if (doctorId && Types.ObjectId.isValid(doctorId)) {
      query.doctor = new Types.ObjectId(doctorId);
    }
    if (roomId && Types.ObjectId.isValid(roomId)) {
      query.room = new Types.ObjectId(roomId);
    }

    const queues = await Queue.find(query)
      .select('queueNumber patientName doctor room status queuedAt priority')
      .populate({ path: 'doctor', select: 'firstName lastName', match: { tenantId: tenantObjectId } })
      .populate({ path: 'room', select: 'name roomNumber', match: { tenantId: tenantObjectId } })
      .sort(QUEUE_SORT)
      .limit(limit)
      .lean();

    const tz = await getTenantTimezone(tenantId);

    // Format for display (escaped at interpolation below)
    const displayData = queues.map((queue: any, index: number) => ({
      queueNumber: queue.queueNumber,
      patientName: initials(queue.patientName),
      doctor: queue.doctor ? `Dr. ${queue.doctor.lastName || ''}`.trim() : 'TBD',
      room: queue.room ? queue.room.name : 'TBD',
      status: queue.status === 'in-progress' ? 'in-progress' : 'waiting',
      position: index + 1,
      estimatedWaitTime: index * 15, // 15 minutes per patient
    }));

    // Return HTML for TV display
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Queue Display</title>
        <meta http-equiv="refresh" content="30">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Arial', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            min-height: 100vh;
          }
          .container {
            max-width: 1400px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .header h1 {
            font-size: 4rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
          }
          .header p {
            font-size: 1.5rem;
            opacity: 0.9;
          }
          .queue-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
          }
          .queue-item {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            border: 2px solid rgba(255, 255, 255, 0.2);
            transition: transform 0.3s, box-shadow 0.3s;
          }
          .queue-item:hover {
            transform: translateY(-5px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          }
          .queue-item.current {
            background: rgba(255, 255, 255, 0.2);
            border-color: #ffd700;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
          }
          .queue-number {
            font-size: 3rem;
            font-weight: bold;
            color: #ffd700;
            margin-bottom: 10px;
          }
          .patient-name {
            font-size: 1.8rem;
            margin-bottom: 10px;
          }
          .queue-info {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-top: 10px;
          }
          .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            margin-top: 10px;
          }
          .status-waiting {
            background: #ffa500;
            color: white;
          }
          .status-in-progress {
            background: #4CAF50;
            color: white;
          }
          .no-queue {
            text-align: center;
            font-size: 2rem;
            margin-top: 100px;
            opacity: 0.7;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          .current {
            animation: pulse 2s infinite;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Patient Queue</h1>
            <p>${e(formatInTz(new Date(), 'MMM d, yyyy h:mm a', tz))}</p>
          </div>
          ${displayData.length === 0 
            ? '<div class="no-queue">No patients in queue</div>'
            : `<div class="queue-list">
                ${displayData.map((item) => `
                  <div class="queue-item ${item.status === 'in-progress' ? 'current' : ''}">
                    <div class="queue-number">${e(item.queueNumber)}</div>
                    <div class="patient-name">${e(item.patientName)}</div>
                    <div class="queue-info">
                      <div>Doctor: ${e(item.doctor)}</div>
                      <div>Room: ${e(item.room)}</div>
                      <div>Position: #${item.position}</div>
                      ${item.estimatedWaitTime > 0 ? `<div>Est. Wait: ${item.estimatedWaitTime} min</div>` : ''}
                    </div>
                    <span class="status-badge status-${item.status}">${item.status.toUpperCase()}</span>
                  </div>
                `).join('')}
              </div>`
          }
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error: any) {
    console.error('Error generating queue display:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate queue display' },
      { status: 500 }
    );
  }
}

