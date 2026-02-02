import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { sendEmail } from '@/lib/email';

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
    paymentAmount?: number;
    paymentMethod?: string;
    paymentReference?: string;
    tenantId?: string;
}

export async function POST(request: NextRequest) {
    try {
        await connectDB();

        const body = (await request.json()) as OnboardingRequest;

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

        // Check if medical rep already exists
        const existingMedRep = await MedicalRepresentative.findOne({ email: body.email.toLowerCase().trim() });
        if (existingMedRep) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Medical representative with this email already exists',
                },
                { status: 409 }
            );
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: body.email.toLowerCase().trim() });
        if (existingUser) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'User account with this email already exists',
                },
                { status: 409 }
            );
        }

        const hasPayment = typeof body.paymentAmount === 'number'
            && body.paymentAmount > 0
            && Boolean(body.paymentMethod?.trim())
            && Boolean(body.paymentReference?.trim());

        // Create medical representative
        const medicalRep = new MedicalRepresentative({
            firstName: body.firstName.trim(),
            lastName: body.lastName.trim(),
            email: body.email.toLowerCase().trim(),
            phone: body.phone.trim(),
            company: body.company.trim(),
            territory: body.territory?.trim(),
            products: body.products || [],
            title: body.title?.trim(),
            bio: body.bio?.trim(),
            status: hasPayment ? 'active' : 'inactive',
            isActivated: hasPayment,
            activationDate: hasPayment ? new Date() : undefined,
            paymentStatus: hasPayment ? 'completed' : 'pending',
            paymentAmount: body.paymentAmount,
            paymentMethod: body.paymentMethod?.trim(),
            paymentReference: body.paymentReference?.trim(),
            paymentDate: hasPayment ? new Date() : undefined
        });

        await medicalRep.save();

        // Send confirmation email
        if (medicalRep.email) {
            try {
                const activationStatus = medicalRep.isActivated ? 'activated' : 'pending activation';
                await sendEmail({
                    to: medicalRep.email,
                    subject: `Medical Representative Registration ${medicalRep.isActivated ? 'Confirmed' : 'Received'}`,
                    html: `
          <h1>Welcome, ${medicalRep.firstName}!</h1>
          <p>Your registration as a Medical Representative has been received.</p>
          <p><strong>Status:</strong> ${activationStatus}</p>
          ${medicalRep.isActivated
                            ? `<p>Your account is now active. You can log in with your credentials.</p>`
                            : `<p>Your account is pending activation. Payment verification is required.</p>`
                        }

          <p><strong>Details:</strong></p>
          <ul>
            <li>Company: ${medicalRep.company}</li>
            <li>Territory: ${medicalRep.territory || 'N/A'}</li>
            <li>Products: ${medicalRep.products?.join(', ') || 'N/A'}</li>
          </ul>
          <p>If you have any questions, please contact support.</p>
        `,
                });
            } catch (emailError: any) {
                console.warn(`Failed to send confirmation email to ${medicalRep.email}:`, emailError.message);
                // Don't fail the registration if email fails
            }
        }
        return NextResponse.json(
            {
                success: true,
                message: medicalRep.isActivated
                    ? 'Medical representative registered and activated successfully'
                    : 'Medical representative registered. Awaiting payment verification.',
                medicalRepresentative: {
                    id: medicalRep._id,
                    name: `${medicalRep.firstName} ${medicalRep.lastName}`,
                    email: medicalRep.email,
                    company: medicalRep.company,
                    isActivated: medicalRep.isActivated,
                    paymentStatus: medicalRep.paymentStatus,
                },
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Medical representative onboarding error:', error);

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to register medical representative',
            },
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
