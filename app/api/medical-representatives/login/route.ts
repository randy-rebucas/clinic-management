import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import Role from '@/models/Role';
import bcrypt from 'bcryptjs';
import { createSession, createPending2fa } from '@/app/lib/dal';
import { sanitizeEmail } from '@/app/lib/security';
import { getTenantContext } from '@/lib/tenant';
import { applyAuthRateLimits, getClientIp, rateLimiters, resetRateLimit } from '@/lib/middleware/rate-limit';

const INVALID_CREDENTIALS = 'Invalid email or password.';

let dummyHash: string | null = null;
function getDummyHash(): string {
	if (!dummyHash) dummyHash = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
	return dummyHash;
}

export async function POST(request: NextRequest) {
	try {
		
		let body: { email?: string; password?: string };
		try {
			body = await request.json();
		} catch {
			return NextResponse.json(
				{ success: false, error: 'Invalid request body. Expected JSON.' },
				{ status: 400 }
			);
		}

		const email = typeof body.email === 'string' ? body.email : '';
		const password = typeof body.password === 'string' ? body.password : '';

		if (!email || !password) {
			return NextResponse.json(
				{ success: false, error: 'Email and password are required.' },
				{ status: 400 }
			);
		}

		const sanitizedEmail = sanitizeEmail(email);

		const accountKey = `medrep:${sanitizedEmail}`;
		const limited = await applyAuthRateLimits(request, accountKey);
		if (limited) return limited;

		await connectDB();

		// Scope the user lookup to the current tenant to prevent cross-tenant auth
		const tenantContext = await getTenantContext();
		const tenantId = tenantContext.tenantId;
		const userQuery: Record<string, unknown> = { email: sanitizedEmail };
		if (tenantId) {
			userQuery.tenantId = tenantId;
		}

		const user = await User.findOne(userQuery).populate('role');

		// Verify the password before revealing anything about the account
		const passwordMatch = await bcrypt.compare(password, user?.password || getDummyHash());
		if (!user || !user.password || !passwordMatch) {
			return NextResponse.json(
				{ success: false, error: INVALID_CREDENTIALS },
				{ status: 401 }
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
				{ success: false, error: INVALID_CREDENTIALS },
				{ status: 401 }
			);
		}

		if (user.mustSetPassword) {
			return NextResponse.json(
				{ success: false, error: 'Check your email to set your password.', code: 'PASSWORD_SETUP_REQUIRED' },
				{ status: 403 }
			);
		}

		if (user.status !== 'active') {
			return NextResponse.json(
				{ success: false, error: 'Your account is not active. Please contact support.', code: 'USER_INACTIVE' },
				{ status: 403 }
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

		await resetRateLimit(rateLimiters.authAccount.config, getClientIp(request.headers), accountKey);

		if (user.totpEnabled) {
			await createPending2fa(user._id.toString(), tenantId ?? undefined);
			return NextResponse.json(
				{ success: false, requires2fa: true, redirectTo: '/login/2fa', error: 'Two-factor authentication required.' },
				{ status: 401 }
			);
		}

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
				undefined,
				user.sessionVersion ?? 0
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
			{ success: false, error: 'Failed to login' },
			{ status: 500 }
		);
	}
}
