import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import RepSignup from '@/models/RepSignup';
import User from '@/models/User';
import { sendEmail } from '@/lib/email';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { isMedRepSelfSignupEnabled } from '@/lib/medrep-signup';
import { turnstileRejection } from '@/lib/turnstile';
import { hashInviteToken } from '@/lib/user-invite';

const SIGNUP_LINK_TTL_MS = 24 * 60 * 60 * 1000;

interface OnboardingRequest {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    company: string;
    territory?: string;
    products?: string[];
    title?: string;
    bio?: string;
    tenantId?: string;
}

export async function POST(request: NextRequest) {
    if (!isMedRepSelfSignupEnabled()) {
        return NextResponse.json(
            { success: false, error: 'Medical representative registration is paused until the rep app launches.' },
            { status: 410 }
        );
    }

    const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
    if (rateLimitResponse) return rateLimitResponse;

    try {
        await connectDB();

        const rawBody = await request.json();
        // Strip any client-supplied payment/activation fields — activation is admin-only
        const { paymentAmount: _pa, paymentMethod: _pm, paymentReference: _pr, isActivated: _ia, status: _st, ...body } = rawBody as any;

        // Validate required fields
        const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'company'];
        const missingFields = requiredFields.filter((field) => !body[field as keyof OnboardingRequest]);

        if (missingFields.length > 0) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Missing required fields: ${missingFields.join(', ')}`,
                },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^\S+@\S+\.\S+$/;
        if (!emailRegex.test(body.email)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid email format',
                },
                { status: 400 }
            );
        }

        // Length caps on string fields
        if (
            (body.firstName?.length ?? 0) > 100 ||
            (body.lastName?.length ?? 0) > 100 ||
            (body.phone?.length ?? 0) > 30 ||
            (body.company?.length ?? 0) > 200 ||
            (body.territory?.length ?? 0) > 200 ||
            (body.bio?.length ?? 0) > 2000 ||
            (body.title?.length ?? 0) > 20
        ) {
            return NextResponse.json(
                { success: false, error: 'One or more fields exceed the maximum allowed length.' },
                { status: 400 }
            );
        }

        // Validate products array
        if (body.products !== undefined) {
            if (!Array.isArray(body.products) || body.products.length > 50 ||
                body.products.some((p: unknown) => typeof p !== 'string' || p.length > 200)) {
                return NextResponse.json(
                    { success: false, error: 'Products must be an array of up to 50 strings (max 200 chars each).' },
                    { status: 400 }
                );
            }
        }

        // After the field checks, so a typo doesn't use up the single-use token.
        const captchaRejected = await turnstileRejection(request, body.turnstileToken);
        if (captchaRejected) return captchaRejected;

        const email = body.email.toLowerCase().trim();

        // Per address, so the form can't be pointed at someone's inbox.
        const emailLimited = await applyRateLimit(request, rateLimiters.repSignupEmail, email);
        if (emailLimited) return emailLimited;

        const base = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/$/, '');

        // Both paths send one email and answer the same, so this form can't show who has an account.
        const emailTaken = (await MedicalRepresentative.findOne({ email })) || (await User.findOne({ email }));
        if (emailTaken) {
            await sendEmail({
                to: email,
                subject: 'Someone tried to register with this email',
                html: `<p>This email already has an account, so no new registration was made.</p>
<p>If this was you, sign in instead. If it wasn't, you can ignore this email.</p>`,
            });
        } else {
            const token = randomBytes(32).toString('base64url');
            await RepSignup.updateOne(
                { email },
                {
                    $set: {
                        tokenHash: hashInviteToken(token),
                        expiresAt: new Date(Date.now() + SIGNUP_LINK_TTL_MS),
                        fields: {
                            firstName: body.firstName.trim(),
                            lastName: body.lastName.trim(),
                            phone: body.phone.trim(),
                            company: body.company.trim(),
                            territory: body.territory?.trim(),
                            products: body.products || [],
                            title: body.title?.trim(),
                            bio: body.bio?.trim(),
                        },
                    },
                },
                { upsert: true }
            );
            await sendEmail({
                to: email,
                subject: 'Confirm your medical representative registration',
                html: `<p>Confirm this email to finish registering as a medical representative. The link works for 24 hours.</p>
<p><a href="${base}/medical-representatives/onboard/confirm?token=${token}">Confirm my registration</a></p>
<p>If you didn't ask for this, you can ignore this email and nothing will happen.</p>`,
            });
        }

        return NextResponse.json(
            { success: true, message: 'Check your email to finish registering.' },
            { status: 202 }
        );
    } catch (error: any) {
        console.error('Medical representative onboarding error:', error);

        return NextResponse.json(
            { success: false, error: 'Failed to register medical representative' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        // Get onboarding form requirements/schema
        return NextResponse.json({
            success: true,
            schema: {
                required: ['firstName', 'lastName', 'email', 'phone', 'company'],
                fields: {
                    firstName: { type: 'string', label: 'First Name' },
                    lastName: { type: 'string', label: 'Last Name' },
                    email: { type: 'email', label: 'Email Address' },
                    phone: { type: 'string', label: 'Phone Number' },
                    company: { type: 'string', label: 'Company Name' },
                    territory: { type: 'string', label: 'Territory (Optional)', required: false },
                    products: { type: 'array', label: 'Products Represented (Optional)', required: false },
                    title: { type: 'string', label: 'Title (Optional)', required: false },
                    bio: { type: 'string', label: 'Bio (Optional)', required: false },
                    paymentAmount: { type: 'number', label: 'Registration Fee', required: false },
                    paymentMethod: { type: 'string', label: 'Payment Method', required: false },
                    paymentReference: { type: 'string', label: 'Payment Reference', required: false },
                },
            },
        });
    } catch (error: any) {
        console.error('Error fetching onboarding schema:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch onboarding information',
            },
            { status: 500 }
        );
    }
}
