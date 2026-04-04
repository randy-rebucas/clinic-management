import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { Types } from 'mongoose';

/**
 * GET /api/patients/lookup
 *
 * Public endpoint for third-party applications.
 * Checks whether a patient exists in a specific tenant's system and returns
 * masked identity data so the patient can confirm it is their account.
 * Also reports which authentication methods are available so the third-party
 * app can render the right login UI (email+password form, OTP form, or both).
 *
 * ── Query parameters ────────────────────────────────────────────────────────
 *   tenantId     (required)  ObjectId of the tenant (clinic) to search in.
 *
 *   At least ONE identifier is required:
 *   phone        Patient's registered phone number.
 *   email        Patient's registered email address.
 *   patientCode  The patient's clinic code (e.g. CLINIC-0001).
 *
 * ── Successful response (patient found) ─────────────────────────────────────
 *   {
 *     "found": true,
 *     "patient": {
 *       "patientCode": "CLINIC-0001",
 *       "firstName": "John",
 *       "maskedLastName": "D***",
 *       "maskedEmail": "j***@example.com",   // null if no email
 *       "maskedPhone": "+63*****1234",        // null if no phone
 *       "active": true
 *     },
 *     "authMethods": {
 *       "password": true,   // patient has an email+password set
 *       "otp": true         // patient has a phone number (can receive OTP)
 *     }
 *   }
 *
 * ── Not found ────────────────────────────────────────────────────────────────
 *   { "found": false }
 *
 * ── Rate limit ───────────────────────────────────────────────────────────────
 *   Uses the public rate limiter (10 req / 15 min per IP).
 *
 * ── Security notes ───────────────────────────────────────────────────────────
 *   • Only masked/partial data is returned — full email, phone, or address are
 *     never exposed.
 *   • Lookup is always tenant-scoped so one clinic's patient list is never
 *     searchable from another clinic's context.
 *   • The endpoint returns HTTP 200 with { found: false } for unknown patients
 *     rather than 404, making automated enumeration less informative.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.public);
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenantId')?.trim() ?? '';
  const phone = searchParams.get('phone')?.trim() ?? '';
  const email = searchParams.get('email')?.toLowerCase().trim() ?? '';
  const patientCode = searchParams.get('patientCode')?.trim() ?? '';

  // ── Validate inputs ────────────────────────────────────────────────────────

  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'tenantId is required' },
      { status: 400 }
    );
  }

  if (!mongoose_isValidId(tenantId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid tenantId format' },
      { status: 400 }
    );
  }

  if (!phone && !email && !patientCode) {
    return NextResponse.json(
      {
        success: false,
        error: 'At least one identifier is required: phone, email, or patientCode',
      },
      { status: 400 }
    );
  }

  try {
    await connectDB();

    const tenantObjectId = new Types.ObjectId(tenantId);

    // Build the identifier portion of the query.
    // Multiple identifiers are OR'd so a patient found by any of them is returned.
    const identifierConditions: any[] = [];
    if (phone) {
      identifierConditions.push(
        { phone },
        { 'contacts.phone': phone }
      );
    }
    if (email) {
      identifierConditions.push(
        { email },
        { 'contacts.email': email }
      );
    }
    if (patientCode) {
      identifierConditions.push({ patientCode });
    }

    const query: any = {
      tenantIds: tenantObjectId,
      $or: identifierConditions,
    };

    // Select password (select:false) only to check existence — never returned
    const patient = await Patient.findOne(query)
      .select(
        'patientCode firstName lastName email phone contacts active password'
      )
      .lean();

    if (!patient) {
      return NextResponse.json({ success: false, found: false });
    }

    // ── Build masked response ────────────────────────────────────────────────
    const resolvedPhone: string =
      (patient as any).phone || (patient as any).contacts?.phone || '';
    const resolvedEmail: string =
      (patient as any).email || (patient as any).contacts?.email || '';

    return NextResponse.json({
      success: true,
      found: true,
      patient: {
        patientCode: (patient as any).patientCode ?? null,
        firstName: (patient as any).firstName,
        maskedLastName: maskName((patient as any).lastName),
        maskedEmail: resolvedEmail ? maskEmail(resolvedEmail) : null,
        maskedPhone: resolvedPhone ? maskPhone(resolvedPhone) : null,
        active: (patient as any).active !== false,
      },
      authMethods: {
        // password method is available when the patient has a password hash stored
        password: !!((patient as any) as any).password,
        // otp method is available when the patient has a phone on file
        otp: !!resolvedPhone,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Lookup failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ── Masking helpers ──────────────────────────────────────────────────────────

/** "Dela Cruz" → "D***" */
function maskName(name: string): string {
  if (!name) return '***';
  return `${name[0]}***`;
}

/**
 * "juan@example.com" → "j***@example.com"
 * "jd@x.co"         → "j***@x.co"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '***@***';
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex); // includes the @
  return `${local[0]}***${domain}`;
}

/**
 * "+639171234567" → "+63*****4567"
 * "09171234567"   → "0****4567"   (keeps first 2 + last 4)
 */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '****';
  const visible = 4;
  const prefix = phone.startsWith('+') ? 2 : 2; // keep +63 or 09
  const raw = phone.replace(/\s/g, '');
  const masked =
    raw.slice(0, prefix) + '*'.repeat(Math.max(0, raw.length - prefix - visible)) + raw.slice(-visible);
  return masked;
}

/** Quick ObjectId format check without throwing */
function mongoose_isValidId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(id);
}
