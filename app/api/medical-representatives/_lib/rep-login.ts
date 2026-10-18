import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import Role from '@/models/Role';
import { sanitizeEmail } from '@/app/lib/security';
import { issueSessionToken, SESSION_TTL_SECONDS } from '@/app/lib/dal';
import { issueRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from '@/app/lib/refresh-tokens';
import { getTenantContext } from '@/lib/tenant';
import { createAuditLog } from '@/lib/audit';
import { applyAuthRateLimits, getClientIp, rateLimiters, resetRateLimit } from '@/lib/middleware/rate-limit';

const INVALID_CREDENTIALS = 'Invalid email or password.';

let dummyHash: string | null = null;
function getDummyHash(): string {
	if (!dummyHash) dummyHash = bcrypt.hashSync('timing-equalizer-not-a-password', 12);
	return dummyHash;
}

/**
 * A medical-representative sign-in, in the audit log like a staff one: success, or the reason
 * it was refused. An unknown email is logged with the address as typed.
 */
export async function auditRepSignIn(
	request: NextRequest,
	user: any,
	email: string,
	tenantId: string | null,
	success: boolean,
	reason?: string
) {
	try {
		await createAuditLog({
			userId: user?._id?.toString(),
			userEmail: user?.email ?? email.slice(0, 254),
			userRole: 'medical-representative',
			tenantId: tenantId ?? user?.tenantId ?? undefined,
			action: 'login',
			resource: 'system',
			success,
			errorMessage: success ? undefined : reason,
			ipAddress: getClientIp(request.headers),
			userAgent: request.headers.get('user-agent') ?? undefined,
			description: success
				? 'Signed in to the medical representative app'
				: `Medical representative sign-in refused: ${reason?.charAt(0).toLowerCase()}${reason?.slice(1)}`,
		});
	} catch (error) {
		console.error('Error logging medical representative sign-in:', error);
	}
}

export type RepCredentials = {
	user: any;
	medicalRep: any;
	roleId?: string;
	tenantId: string | null;
	email: string;
};

/**
 * Check a medical representative's email + password and account state. Rate-limited per IP and
 * per account; the response time does not reveal whether the account exists. Does not issue a
 * session and does not handle the second factor — the caller does both.
 */
export async function verifyRepCredentials(
	request: NextRequest
): Promise<{ ok: true; value: RepCredentials } | { ok: false; response: NextResponse }> {
	const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => ({
		ok: false as const,
		response: NextResponse.json({ success: false, error, ...extra }, { status }),
	});

	let body: { email?: unknown; password?: unknown };
	try {
		body = await request.json();
	} catch {
		return fail('Invalid request body. Expected JSON.', 400);
	}

	const email = typeof body.email === 'string' ? body.email : '';
	const password = typeof body.password === 'string' ? body.password : '';
	if (!email || !password) {
		return fail('Email and password are required.', 400);
	}

	const sanitizedEmail = sanitizeEmail(email);
	const accountKey = `medrep:${sanitizedEmail}`;
	const limited = await applyAuthRateLimits(request, accountKey);
	if (limited) return { ok: false, response: limited };

	await connectDB();

	// Scope the user lookup to the current tenant to prevent cross-tenant auth
	const tenantContext = await getTenantContext();
	const tenantId = tenantContext.tenantId;
	const userQuery: Record<string, unknown> = { email: sanitizedEmail };
	if (tenantId) userQuery.tenantId = tenantId;

	const user = await User.findOne(userQuery).populate('role');

	// Verify the password before revealing anything about the account
	const passwordMatch = await bcrypt.compare(password, user?.password || getDummyHash());
	if (!user || !user.password || !passwordMatch) {
		// Not awaited: the response time must not reveal whether the account exists.
		void auditRepSignIn(request, user, sanitizedEmail, tenantId, false, user ? 'Wrong password' : 'No account with this email');
		return fail(INVALID_CREDENTIALS, 401);
	}

	const roleNameFromPopulate = typeof user.role === 'object' && user.role && 'name' in user.role
		? (user.role as any).name
		: undefined;
	const roleId = typeof user.role === 'object' && user.role && '_id' in user.role
		? (user.role as any)._id?.toString()
		: user.role?.toString();

	let roleName = roleNameFromPopulate;
	if (!roleName && roleId) {
		const role = await Role.findById(roleId).select('name').lean<{ name?: string } | null>();
		roleName = role?.name;
	}

	if (roleName !== 'medical-representative') {
		await auditRepSignIn(request, user, sanitizedEmail, tenantId, false, 'Not a medical representative account');
		return fail(INVALID_CREDENTIALS, 401);
	}

	if (user.mustSetPassword) {
		await auditRepSignIn(request, user, sanitizedEmail, tenantId, false, 'Invite not accepted yet');
		return fail('Check your email to set your password.', 403, { code: 'PASSWORD_SETUP_REQUIRED' });
	}

	if (user.status !== 'active') {
		await auditRepSignIn(request, user, sanitizedEmail, tenantId, false, user.status === 'suspended' ? 'Account is suspended' : 'Account is closed');
		return fail('Your account is not active. Please contact support.', 403, { code: 'USER_INACTIVE' });
	}

	const medicalRep = user.medicalRepresentativeProfile
		? await MedicalRepresentative.findById(user.medicalRepresentativeProfile)
		: await MedicalRepresentative.findOne({ email: sanitizedEmail });

	if (!medicalRep) {
		return fail('Medical representative profile not found.', 404);
	}

	if (!medicalRep.isActivated || medicalRep.status !== 'active') {
		await auditRepSignIn(request, user, sanitizedEmail, tenantId, false, 'Representative profile not activated');
		return fail('Your account is not activated. Please complete payment or contact support.', 403, { code: 'MEDREP_INACTIVE' });
	}

	await resetRateLimit(rateLimiters.authAccount.config, getClientIp(request.headers), accountKey);

	return { ok: true, value: { user, medicalRep, roleId, tenantId, email: sanitizedEmail } };
}

/** Record a completed sign-in: last-login timestamps and the audit entry. */
export async function recordRepSignIn(request: NextRequest, creds: RepCredentials) {
	await Promise.all([
		MedicalRepresentative.updateOne({ _id: creds.medicalRep._id }, { lastLogin: new Date() }),
		User.updateOne({ _id: creds.user._id }, { lastLogin: new Date() }),
	]);
	await auditRepSignIn(request, creds.user, creds.email, creds.tenantId, true);
}

/** Mobile sign-in: issue the session as a Bearer token, record the sign-in, build the response. */
export async function repTokenResponse(request: NextRequest, creds: RepCredentials): Promise<NextResponse> {
	const tokens = await issueRepAppTokens(creds.user, creds.roleId);
	await recordRepSignIn(request, creds);

	return NextResponse.json({
		success: true,
		...tokens,
		medicalRepresentative: repSummary(creds.medicalRep),
	});
}

/**
 * The app's token pair for a rep: a session JWT (Bearer) plus a refresh token in `family`
 * (a new chain when omitted). Both are tied to the user's current sessionVersion.
 */
export async function issueRepAppTokens(user: any, roleId?: string, family?: string) {
	const sessionVersion = user.sessionVersion ?? 0;
	const { token } = await issueSessionToken(
		user._id.toString(),
		user.email,
		'medical-representative',
		roleId,
		undefined,
		sessionVersion
	);
	const refreshToken = await issueRefreshToken('user', user._id, sessionVersion, family);
	return {
		token,
		tokenType: 'Bearer' as const,
		expiresIn: SESSION_TTL_SECONDS,
		refreshToken,
		refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
	};
}

/**
 * Whether a user may still hold a rep app session: active account, still a medical
 * representative, and an activated rep profile.
 */
export async function loadActiveRep(userId: string): Promise<{ user: any; roleId?: string } | null> {
	await connectDB();
	const user = await User.findById(userId).populate('role');
	const role = user?.role as any;
	if (!user || user.status !== 'active' || role?.name !== 'medical-representative') return null;
	const medicalRep = user.medicalRepresentativeProfile
		? await MedicalRepresentative.findById(user.medicalRepresentativeProfile).select('isActivated status').lean<any>()
		: await MedicalRepresentative.findOne({ email: user.email }).select('isActivated status').lean<any>();
	if (!medicalRep?.isActivated || medicalRep.status !== 'active') return null;
	return { user, roleId: role?._id?.toString() };
}

/** The rep summary returned on sign-in. */
export function repSummary(medicalRep: any) {
	return {
		id: medicalRep._id,
		name: `${medicalRep.firstName} ${medicalRep.lastName}`.trim(),
		company: medicalRep.company,
		email: medicalRep.email,
	};
}
