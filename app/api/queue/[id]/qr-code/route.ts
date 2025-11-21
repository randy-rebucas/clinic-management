import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Queue from '@/models/Queue';
import QRCode from 'qrcode';

/**
 * Generate QR code for queue check-in
 * Public endpoint - no authentication required
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const { id } = await params;
    const queue = await Queue.findById(id);

    if (!queue) {
      return NextResponse.json(
        { success: false, error: 'Queue entry not found' },
        { status: 404 }
      );
    }

    if (!queue.qrCode) {
      return NextResponse.json(
        { success: false, error: 'QR code not available' },
        { status: 404 }
      );
    }

    // Generate QR code image
    const qrCodeImage = await QRCode.toDataURL(queue.qrCode, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 1,
    });

    // Return HTML page with QR code
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Check-in QR Code</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
          }
          .qr-code {
            margin: 20px 0;
            background: white;
            padding: 20px;
            border-radius: 10px;
            display: inline-block;
          }
          .queue-number {
            font-size: 2rem;
            font-weight: bold;
            margin: 20px 0;
            color: #ffd700;
          }
          .instructions {
            margin-top: 20px;
            font-size: 1.1rem;
            opacity: 0.9;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Check-in QR Code</h1>
          <div class="queue-number">${queue.queueNumber}</div>
          <div class="qr-code">
            <img src="${qrCodeImage}" alt="QR Code" />
          </div>
          <div class="instructions">
            <p>Scan this QR code at the clinic reception to check in</p>
            <p>Queue Number: <strong>${queue.queueNumber}</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error: any) {
    console.error('Error generating QR code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}

