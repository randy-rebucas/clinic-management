import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { verifySession } from '@/app/lib/dal';
import { unauthorizedResponse, isAdmin } from '@/app/lib/auth-helpers';
import { runAsSystem, runWithTenant } from '@/lib/tenant-context';
import { listTenants, createTenant, isSubdomainAvailable } from '@/lib/data/tenant';
import { createUser } from '@/lib/data/user';
import { createRole, appRoleToRoleName } from '@/lib/data/role';

/**
 * RECONCILIATION NOTE (Phase 5 Batch 2): the pre-migration Mongoose version
 * of this route referenced `slug`, `domain`, and `isActive` fields that
 * never existed on models/Tenant.ts or prisma/schema.prisma — dead/drifted
 * code (same class of bug as the `getTenantBySlug` dead code flagged in
 * lib/tenant.ts's Batch 1 NOTE comment). The real Tenant fields are
 * `subdomain` (unique) and `status: 'active' | 'inactive' | 'suspended'`.
 * This rewrite uses the real fields throughout: the request body now takes
 * `subdomain` instead of `slug`/`domain`, and "active" filtering uses
 * `status: 'active'` instead of the fictional `isActive` boolean.
 */
export async function GET(request: NextRequest) {
  try {
    // Only expose minimal fields needed for subdomain/clinic selection UI.
    // Cross-tenant listing — wrapped in runAsSystem() per the tenant branch policy.
    const tenants = await runAsSystem(() => listTenants({ status: 'active' }));

    return NextResponse.json({
      success: true,
      data: tenants.map((t) => ({ id: t.id, name: t.name, subdomain: t.subdomain, status: t.status })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Require admin authentication to create tenants
  const session = await verifySession();
  if (!session) {
    return unauthorizedResponse();
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { subdomain, name, currency, language, email, phone, companyName } = body;

    if (!subdomain || !name) {
      return NextResponse.json(
        { success: false, error: 'Subdomain and name are required' },
        { status: 400 }
      );
    }

    // Validate subdomain format (was slug format in the old fictional-field version)
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json(
        { success: false, error: 'Subdomain can only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    const normalizedSubdomain = subdomain.toLowerCase();

    // Check if tenant already exists. Tenant is the scoping root — this
    // whole POST runs under runAsSystem() per lib/data/tenant.ts's convention.
    const available = await runAsSystem(() => isSubdomainAvailable(normalizedSubdomain));
    if (!available) {
      return NextResponse.json(
        { success: false, error: 'Tenant with this subdomain already exists' },
        { status: 400 }
      );
    }

    // theme/notifications/features from the old getDefaultTenantSettings()
    // helper had no corresponding Prisma Tenant column (dead fields on the
    // fictional schema) — dropped. currency/language/timezone map to the
    // flattened settings* columns; email/phone/companyName map to the
    // Tenant's own top-level columns (companyName -> displayName).
    const tenant = await runAsSystem(() =>
      createTenant({
        subdomain: normalizedSubdomain,
        name,
        status: 'active',
        settingsCurrency: currency || 'USD',
        settingsLanguage: language === 'es' ? 'es' : 'en',
        settingsTimezone: 'UTC',
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(companyName ? { displayName: companyName } : {}),
      })
    );

    // Automatically create a minimal admin Role + admin User for the tenant.
    // (This bare-bones route predates app/api/tenants/onboard's full
    // role/permission seeding; it only needs an admin Role to satisfy
    // User.roleId's required FK, so it creates a minimal one here rather
    // than duplicating onboard's DEFAULT_ROLE_PERMISSIONS seeding.)
    const adminEmail = `admin@${tenant.subdomain}.local`;
    // Cryptographically random temporary password (not Math.random)
    const tempPassword = randomBytes(12).toString('base64url');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    let adminUserCreated = true;
    try {
      await runWithTenant(tenant.id, async () => {
        const adminRole = await createRole({
          tenant: { connect: { id: tenant.id } },
          name: appRoleToRoleName('admin'),
          displayName: 'Administrator',
          level: 100,
          isActive: true,
        });

        await createUser({
          name: 'Administrator',
          email: adminEmail,
          password: hashedPassword,
          role: { connect: { id: adminRole.id } },
          tenant: { connect: { id: tenant.id } },
          status: 'active',
        });
      });
    } catch (userError: any) {
      console.error('Failed to create admin user:', userError.message);
      adminUserCreated = false;
    }

    return NextResponse.json({
      success: true,
      data: tenant,
      adminUser: adminUserCreated
        ? {
            email: adminEmail,
            temporaryPassword: tempPassword,
            note: 'Temporary password — change immediately after first login.',
          }
        : null,
    }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { success: false, error: 'subdomain already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
