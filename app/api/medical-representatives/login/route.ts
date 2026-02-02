import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import Role from '@/models/Role';
import bcrypt from 'bcryptjs';
import { createSession } from '@/app/lib/dal';
import { sanitizeEmail, checkRateLimit, resetRateLimit } from '@/app/lib/security';

export async function POST(request: NextRequest) {
	try {
		console.log('Medical representative login attempt');
		
		let body: { email?: string; password?: string };
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ success: false, error: 'Invalid request body. Expected JSON.' },
				{ status: 400 }
			);
		}

		const email = body.email?.toString() || '';
		const password = body.password?.toString() || '';

		if (!email || !password) {
			return NextResponse.json(
				{ success: false, error: 'Email and password are required.' },
				{ status: 400 }
			);
		}

		const sanitizedEmail = sanitizeEmail(email);

		const rateLimitCheck = checkRateLimit(sanitizedEmail);
		if (!rateLimitCheck.allowed) {
			return NextResponse.json(
				{
					success: false,
					error: `Too many login attempts. Please try again in ${rateLimitCheck.remainingTime} minute(s).`,
				},
				{ status: 429 }
			);
		}

		await connectDB();

		const user = await User.findOne({ email: sanitizedEmail }).populate('role');
		if (!user) {
			return NextResponse.json(
				{ success: false, error: 'Invalid email or password.' },
				{ status: 401 }
			);
		}

		if (!user.password) {
			return NextResponse.json(
				{ success: false, error: 'Invalid email or password.' },
				{ status: 401 }
			);
		}

		if (user.status !== 'active') {
			return NextResponse.json(
				{ success: false, error: 'Your account is not active. Please contact support.', code: 'USER_INACTIVE' },
				{ status: 403 }
			);
		}

		const roleNameFromPopulate = typeof user.role === 'object' && user.role && 'name' in user.role
			? (user.role as any).name
			: undefined;
		const roleId = typeof user.role === 'object' && user.role && '_id' in user.role
			? (user.role as any)._id?.toString()
			: user.role?.toString();

		let roleName = roleNameFromPopulate;
		if (!roleName && roleId) {
			const role = await Role.findById(roleId)
				.select('name')
				.lean<{ name?: string } | null>();
			roleName = role?.name;
		}

		if (roleName !== 'medical-representative') {
			return NextResponse.json(
				{ success: false, error: 'Forbidden - Medical representative access only.', code: 'ROLE_MISMATCH' },
				{ status: 403 }
			);
		}

		const passwordMatch = await bcrypt.compare(password, user.password);
		if (!passwordMatch) {
			return NextResponse.json(
				{ success: false, error: 'Invalid email or password.' },
				{ status: 401 }
			);
		}

		const medicalRep = user.medicalRepresentativeProfile
			? await MedicalRepresentative.findById(user.medicalRepresentativeProfile)
			: await MedicalRepresentative.findOne({ email: sanitizedEmail });

		if (!medicalRep) {
			return NextResponse.json(
				{ success: false, error: 'Medical representative profile not found.' },
				{ status: 404 }
			);
		}

		if (!medicalRep.isActivated || medicalRep.status !== 'active') {
			return NextResponse.json(
				{ success: false, error: 'Your account is not activated. Please complete payment or contact support.', code: 'MEDREP_INACTIVE' },
				{ status: 403 }
			);
		}

		resetRateLimit(sanitizedEmail);

		// Update last login timestamps
		await Promise.all([
			MedicalRepresentative.updateOne({ _id: medicalRep._id }, { lastLogin: new Date() }),
			User.updateOne({ _id: user._id }, { lastLogin: new Date() })
		]);

		try {
			await createSession(
				user._id.toString(),
				user.email,
				'medical-representative',
				roleId,
				undefined
			);
		} catch (sessionError: any) {
			console.error('Medical representative session creation error:', sessionError);
			return NextResponse.json(
				{ success: false, error: 'Failed to create session. Please try again.' },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			message: 'Login successful',
			medicalRepresentative: {
				id: medicalRep._id,
				name: `${medicalRep.firstName} ${medicalRep.lastName}`.trim(),
				company: medicalRep.company,
				email: medicalRep.email,
			},
		});
	} catch (error: any) {
		console.error('Medical representative login error:', error);
		return NextResponse.json(
			{ success: false, error: error.message || 'Failed to login' },
			{ status: 500 }
		);
	}
}
