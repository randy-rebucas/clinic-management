import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { runAsSystem } from '@/lib/tenant-context';
import { sendEmail } from '@/lib/email';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';

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

// Self-registration is tenant-agnostic (matches the Mongoose behavior,
// which never set tenantId on self-registered reps), so this always runs
// via runAsSystem rather than resolving a tenant from the request.
export async function POST(request: NextRequest) {
    const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
    if (rateLimitResponse) return rateLimitResponse;

    try {
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

        const medicalRep = await runAsSystem(async () => {
            const normalizedEmail = body.email.toLowerCase().trim();

            // Check if medical rep already exists
            const existingMedRep = await prisma.medicalRepresentative.findFirst({ where: { email: normalizedEmail } });
            if (existingMedRep) {
                throw new DuplicateError('Medical representative with this email already exists');
            }

            // Check if user already exists
            const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
            if (existingUser) {
                throw new DuplicateError('User account with this email already exists');
            }

            // All self-registrations are inactive until an admin or payment webhook activates them
            return prisma.medicalRepresentative.create({
                data: {
                    firstName: body.firstName.trim(),
                    lastName: body.lastName.trim(),
                    email: normalizedEmail,
                    phone: body.phone.trim(),
                    company: body.company.trim(),
                    territory: body.territory?.trim(),
                    products: body.products || [],
                    title: body.title?.trim(),
                    bio: body.bio?.trim(),
                    status: 'inactive',
                    isActivated: false,
                    paymentStatus: 'pending',
                },
            });
        });

        // Send confirmation email (escape all user-supplied values)
        if (medicalRep.email) {
            try {
                const esc = (s: string) => s
                    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                await sendEmail({
                    to: medicalRep.email,
                    subject: 'Medical Representative Registration Received',
                    html: `
          <h1>Welcome, ${esc(medicalRep.firstName)}!</h1>
          <p>Your registration as a Medical Representative has been received and is pending admin review.</p>
          <p><strong>Status:</strong> Pending activation</p>
          <p>Your account requires payment verification before you can log in. Our team will contact you shortly.</p>
          <p>If you have any questions, please contact support.</p>
        `,
                });
            } catch (emailError: any) {
                console.warn('Failed to send confirmation email:', emailError.message);
                // Don't fail the registration if email fails
            }
        }
        return NextResponse.json(
            {
                success: true,
                message: 'Medical representative registered. Awaiting payment verification and admin activation.',
                medicalRepresentative: {
                    id: medicalRep.id,
                    name: `${medicalRep.firstName} ${medicalRep.lastName}`,
                    email: medicalRep.email,
                    company: medicalRep.company,
                },
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Medical representative onboarding error:', error);

        if (error instanceof DuplicateError) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 409 }
            );
        }

        return NextResponse.json(
            { success: false, error: 'Failed to register medical representative' },
            { status: 500 }
        );
    }
}

class DuplicateError extends Error {}

export async function GET(request: NextRequest) {
    try {
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
