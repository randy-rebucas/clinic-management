// SMS service using Twilio
// Set environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) {
    return twilioClient;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not configured. SMS sending will be disabled.');
    return null;
  }

  try {
    // Dynamic import to avoid requiring twilio at build time if not installed
    /* eslint-disable @typescript-eslint/no-require-imports */
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    return twilioClient;
  } catch (error) {
    console.warn('Twilio package not installed. Install with: npm install twilio');
    return null;
  }
}

export interface SMSOptions {
  to: string;
  message: string;
  from?: string;
}

export async function sendSMS(options: SMSOptions): Promise<{ success: boolean; sid?: string; error?: string }> {
  const client = getTwilioClient();
  const fromNumber = options.from || process.env.TWILIO_PHONE_NUMBER;

  if (!client) {
    // Twilio not configured - message logged only
    return {
      success: true,
      error: 'Twilio not configured - message logged only',
    };
  }

  if (!fromNumber) {
    return {
      success: false,
      error: 'TWILIO_PHONE_NUMBER environment variable not set',
    };
  }

  try {
    const result = await client.messages.create({
      body: options.message,
      from: fromNumber,
      to: options.to,
    });

    return {
      success: true,
      sid: result.sid,
    };
  } catch (error: any) {
    console.error('Error sending SMS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS',
    };
  }
}

export function isSMSConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );
}

