import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { runWithTenant, runAsSystem } from '@/lib/tenant-context';
import { getUserByEmailWithPassword } from '@/lib/data/user';
import { getRoleById, roleNameToAppRole } from '@/lib/data/role';
import { createSession } from '@/app/lib/dal';
import { sanitizeEmail, checkRateLimit, resetRateLimit } from '@/app/lib/security';
import { getTenantContext } from '@/lib/tenant';

// NOTE: there is no lib/data/medical-representative.ts (Phase 4 did not
// produce one for this batch), so MedicalRepresentative reads/writes below
// call `prisma.medicalRepresentative` directly rather than reaching for a
// data-access module that doesn't exist. MedicalRepresentative is a
// junction-scoped model (see lib/prisma-tenant-extension.ts), so every call
// here still needs to run inside runWithTenant/runAsSystem like the User
// calls do.
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

		// Scope the user lookup to the current tenant to prevent cross-tenant auth.
		// Explicit tenant branch: a resolved tenant -> runWithTenant (auto-scoped
		// User/MedicalRepresentative queries); no tenant (legacy no-subdomain
		// mode) -> runAsSystem, with no tenantId condition added to the User
		// lookup at all (matches today's unscoped-when-no-tenant behavior).
		const tenantContext = await getTenantContext();
		const tenantId = tenantContext.tenantId;

		const attempt = async () => {
			const user = tenantId
				? await getUserByEmailWithPassword(sanitizedEmail, tenantId)
				: await getUserByEmailWithPassword(sanitizedEmail);
			if (!user) {
				return { status: 401 as const, error: 'Invalid email or password.' };
			}

			if (!user.password) {
				return { status: 401 as const, error: 'Invalid email or password.' };
			}

			if (user.status !== 'active') {
				return { status: 403 as const, error: 'Your account is not active. Please contact support.', code: 'USER_INACTIVE' };
			}

			let roleName = user.role ? roleNameToAppRole(user.role.name) : undefined;
			const roleId = user.roleId;
			if (!roleName && roleId) {
				const role = await getRoleById(roleId);
				roleName = role ? roleNameToAppRole(role.name) : undefined;
			}

			if (roleName !== 'medical-representative') {
				return { status: 403 as const, error: 'Forbidden - Medical representative access only.', code: 'ROLE_MISMATCH' };
			}

			const passwordMatch = await bcrypt.compare(password, user.password);
			if (!passwordMatch) {
				return { status: 401 as const, error: 'Invalid email or password.' };
			}

			const medicalRep = user.medicalRepresentativeProfileId
				? await prisma.medicalRepresentative.findUnique({ where: { id: user.medicalRepresentativeProfileId } })
				: await prisma.medicalRepresentative.findFirst({ where: { email: sanitizedEmail } });

			if (!medicalRep) {
				return { status: 404 as const, error: 'Medical representative profile not found.' };
			}

			if (!medicalRep.isActivated || medicalRep.status !== 'active') {
				return { status: 403 as const, error: 'Your account is not activated. Please complete payment or contact support.', code: 'MEDREP_INACTIVE' };
			}

			resetRateLimit(sanitizedEmail);

			// Update last login timestamps
			await Promise.all([
				prisma.medicalRepresentative.update({ where: { id: medicalRep.id }, data: { lastLogin: new Date() } }),
				prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } }),
			]);

			return { status: 200 as const, user, roleId, medicalRep };
		};

		const result = tenantId ? await runWithTenant(tenantId, attempt) : await runAsSystem(attempt);

		if (result.status !== 200) {
			return NextResponse.json(
				{ success: false, error: result.error, ...('code' in result ? { code: result.code } : {}) },
				{ status: result.status }
			);
		}

		const { user, roleId, medicalRep } = result;

		try {
			await createSession(
				user.id,
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
				id: medicalRep.id,
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
