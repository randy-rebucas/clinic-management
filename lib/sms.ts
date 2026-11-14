// SMS service using Twilio
// Set environment variables: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and a sender:
// TWILIO_MESSAGING_SERVICE_SID (registered alphanumeric sender; required for Philippine delivery)
// or TWILIO_PHONE_NUMBER.

import twilio from 'twilio';
import { Types } from 'mongoose';
import SmsMessage from '@/models/SmsMessage';
import { decideSms, isFinalBlock, refundSmsQuota, smsSegments, type SmsBlockReason, type SmsCategory, type SmsDecision } from './sms-policy';
import { maskPhone, normalizePhone, smsCountryAllowed } from './phone';

let twilioClient: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  if (twilioClient) {
    return twilioClient;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('Twilio credentials not configured. SMS sending will be disabled.');
    return null;
  }

  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

export interface SMSOptions {
  to: string;
  message: string;
  from?: string;
  /** The clinic sending. Null for platform messages, which skip the clinic's policy and quota. */
  tenantId: Types.ObjectId | string | null | undefined;
  /** `auth` is for sign-in codes only: never blocked, never counted against a clinic. */
  category: SmsCategory;
  /** Short name of the message, for the delivery log. */
  template: string;
  patientId?: Types.ObjectId | string;
}

export interface SMSResult {
  success: boolean;
  sid?: string;
  error?: string;
  /** True when nothing was actually sent (SMS not configured). */
  skipped?: boolean;
  /** Why the clinic's policy stopped this text. */
  blocked?: SmsBlockReason;
}

/** The public URL for delivery callbacks; Twilio can't reach local addresses. */
function statusCallback(id: Types.ObjectId): string | undefined {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/\/+$/, '');
  return base.startsWith('https://') ? `${base}/api/webhooks/twilio/status?id=${id}` : undefined;
}

/** A log failure must never fail the text, which has already gone out. */
async function logSms(fields: Record<string, unknown>) {
  try {
    await SmsMessage.create(fields);
  } catch (error) {
    console.error('Error logging SMS:', error);
  }
}

/**
 * Send an SMS. The recipient is normalized to E.164 here (Philippine numbers by default), so
 * callers pass the phone exactly as stored. A clinic's text goes through its policy first
 * (lib/sms-policy.ts); a stopped text comes back as `blocked`.
 */
export async function sendSMS(options: SMSOptions): Promise<SMSResult> {
  const to = normalizePhone(options.to);
  if (!to) {
    return { success: false, error: 'Invalid phone number' };
  }
  if (!smsCountryAllowed(to)) {
    return { success: false, error: 'Texts to this country are not enabled' };
  }

  const client = getTwilioClient();
  const messagingServiceSid = options.from ? undefined : process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = options.from || process.env.TWILIO_PHONE_NUMBER;

  if (!client) {
    // Twilio not configured - message logged only
    return {
      success: true,
      skipped: true,
      error: 'Twilio not configured - message logged only',
    };
  }

  if (!messagingServiceSid && !fromNumber) {
    return {
      success: false,
      error: 'No SMS sender set: TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER',
    };
  }

  let body = options.message;
  let reservation: Extract<SmsDecision, { allowed: true }>['reservation'];
  if (options.tenantId && options.category !== 'auth') {
    const decision = await decideSms({
      tenantId: options.tenantId,
      category: options.category,
      phone: to,
      message: options.message,
      template: options.template,
    });
    if (!decision.allowed) {
      return { success: false, blocked: decision.reason, error: `SMS blocked: ${decision.reason}` };
    }
    body = decision.message;
    reservation = decision.reservation;
  }

  const logId = new Types.ObjectId();
  const log = {
    _id: logId,
    tenantId: options.tenantId || undefined,
    patientId: options.patientId,
    template: options.template,
    category: options.category,
    phoneMasked: maskPhone(to),
    segments: reservation?.segments ?? smsSegments(body),
  };
  const callback = statusCallback(logId);

  try {
    const result = await client.messages.create({
      body,
      ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber }),
      to,
      ...(callback ? { statusCallback: callback } : {}),
    });
    await logSms({ ...log, sid: result.sid, status: 'sent' });

    return {
      success: true,
      sid: result.sid,
    };
  } catch (error: any) {
    console.error('Error sending SMS:', error);
    await logSms({ ...log, status: 'failed', errorCode: error.code ? String(error.code) : undefined });
    if (reservation) {
      await refundSmsQuota(reservation.tenantId, reservation.month, reservation.segments).catch((refundError) =>
        console.error('Error refunding SMS quota:', refundError)
      );
    }
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
    (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER)
  );
}

/** True only when the message actually went to Twilio; a skipped send reports success. */
export function smsSent(result: SMSResult | null | undefined): boolean {
  return !!result && result.success && !result.skipped;
}

/** Sent, or stopped for a reason a retry won't change: either way, stop trying this text. */
export function smsSettled(result: SMSResult | null | undefined): boolean {
  return smsSent(result) || isFinalBlock(result?.blocked);
}

