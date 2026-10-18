import { NextRequest, NextResponse } from 'next/server';
import { createSession, createPending2fa } from '@/app/lib/dal';
import { recordRepSignIn, repSummary, verifyRepCredentials } from '../_lib/rep-login';

/**
 * POST /api/medical-representatives/login
 * Cookie sign-in. The mobile app uses POST /api/medical-representatives/auth/token instead,
 * which returns the same session as a Bearer token.
 */
export async function POST(request: NextRequest) {
	try {
		const result = await verifyRepCredentials(request);
		if (!result.ok) return result.response;
		const creds = result.value;

		if (creds.user.totpEnabled) {
			await createPending2fa(creds.user._id.toString(), creds.tenantId ?? undefined);
			return NextResponse.json(
				{ success: false, requires2fa: true, redirectTo: '/login/2fa', error: 'Two-factor authentication required.' },
				{ status: 401 }
			);
		}

		try {
			await createSession(
				creds.user._id.toString(),
				creds.user.email,
				'medical-representative',
				creds.roleId,
				undefined,
				creds.user.sessionVersion ?? 0
			);
		} catch (sessionError: any) {
			console.error('Medical representative session creation error:', sessionError);
			return NextResponse.json(
				{ success: false, error: 'Failed to create session. Please try again.' },
				{ status: 500 }
			);
		}

		await recordRepSignIn(request, creds);

		return NextResponse.json({
			success: true,
			message: 'Login successful',
			medicalRepresentative: repSummary(creds.medicalRep),
		});
	} catch (error: any) {
		console.error('Medical representative login error:', error);
		return NextResponse.json(
			{ success: false, error: 'Failed to login' },
			{ status: 500 }
		);
	}
}
