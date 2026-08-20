import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_PERMISSIONS, type RoleName as AppRoleName } from '@/lib/permissions';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { runAsSystem, runWithTenant } from '@/lib/tenant-context';
import { createTenant, isSubdomainAvailable } from '@/lib/data/tenant';
import { upsertRoleWithPermissions, appRoleToRoleName } from '@/lib/data/role';
import { getUserByEmail, createUser, updateUser } from '@/lib/data/user';
import { getAdminByEmail, createAdmin } from '@/lib/data/admin';
import { updateSettings } from '@/lib/data/settings';

// This route touches only Tenant/Role/Permission/Admin/User/Settings — all
// already migrated to Prisma (Batch 1 + this batch). No PayPal/billing
// model writes exist here to leave on Mongoose; the trial subscription is
// just flattened Tenant columns (subscriptionPlan/Status/ExpiresAt), not a
// PayPal integration.

const RESERVED_WORDS = [
  'www',
  'api',
  'admin',
  'app',
  'mail',
  'ftp',
  'localhost',
  'staging',
  'dev',
  'test',
  'demo',
];

function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain || subdomain.length < 2) {
    return { valid: false, error: 'Subdomain must be at least 2 characters long' };
  }

  if (subdomain.length > 63) {
    return { valid: false, error: 'Subdomain must be at most 63 characters long' };
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return { valid: false, error: 'Subdomain must contain only lowercase letters, numbers, and hyphens' };
  }

  if (RESERVED_WORDS.includes(subdomain.toLowerCase())) {
    return { valid: false, error: `Subdomain "${subdomain}" is reserved and cannot be used` };
  }

  return { valid: true };
}

const ROLES_TO_CREATE: { name: AppRoleName; displayName: string; description: string; level: number }[] = [
  {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Full system access with all permissions',
    level: 100,
  },
  {
    name: 'doctor',
    displayName: 'Doctor',
    description: 'Clinical staff with access to patient care, visits, and prescriptions',
    level: 80,
  },
  {
    name: 'nurse',
    displayName: 'Nurse',
    description: 'Clinical staff with access to patient care and lab results',
    level: 60,
  },
  {
    name: 'receptionist',
    displayName: 'Receptionist',
    description: 'Front desk staff with access to appointments and patient management',
    level: 40,
  },
  {
    name: 'accountant',
    displayName: 'Accountant',
    description: 'Financial staff with access to billing and invoices',
    level: 30,
  },
];

export async function POST(request: NextRequest) {
  // Rate-limit self-registration to 5 attempts per 15 minutes per IP
  const rateLimitResponse = await applyRateLimit(request, rateLimiters.auth);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError: any) {
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request body. Expected JSON.',
          errors: {
            general: ['Invalid request format. Please try again.'],
          },
        },
        { status: 400 }
      );
    }

    const {
      name,
      displayName,
      subdomain,
      email,
      phone,
      address,
      settings,
      admin,
    } = body;

    // Validate required fields
    if (!name || !subdomain || !admin?.name || !admin?.email || !admin?.password) {
      const missingFields = [];
      const fieldErrors: any = {};

      if (!name || !name.trim()) {
        missingFields.push('name');
        fieldErrors.tenantName = ['Tenant name is required'];
      }
      if (!subdomain || !subdomain.trim()) {
        missingFields.push('subdomain');
        fieldErrors.subdomain = ['Subdomain is required'];
      }
      if (!admin?.name || !admin.name.trim()) {
        missingFields.push('admin.name');
        fieldErrors.adminName = ['Admin name is required'];
      }
      if (!admin?.email || !admin.email.trim()) {
        missingFields.push('admin.email');
        fieldErrors.adminEmail = ['Admin email is required'];
      }
      if (!admin?.password || !admin.password.trim()) {
        missingFields.push('admin.password');
        fieldErrors.adminPassword = ['Admin password is required'];
      }

      console.error('Missing required fields:', missingFields);

      return NextResponse.json(
        {
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          errors: {
            ...fieldErrors,
            general: [`Missing required fields: ${missingFields.join(', ')}`],
          },
        },
        { status: 400 }
      );
    }

    // Validate subdomain
    const subdomainValidation = validateSubdomain(subdomain.toLowerCase());
    if (!subdomainValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          message: subdomainValidation.error,
          errors: {
            subdomain: [subdomainValidation.error || 'Invalid subdomain'],
          },
        },
        { status: 400 }
      );
    }

    const normalizedSubdomain = subdomain.toLowerCase().trim();
    const normalizedAdminEmail = admin.email.toLowerCase().trim();

    // Check if subdomain already exists, and check if admin email already
    // exists across ANY tenant — both are legitimately cross-tenant checks,
    // run under runAsSystem().
    const [subdomainAvailable, existingUser] = await runAsSystem(() =>
      Promise.all([isSubdomainAvailable(normalizedSubdomain), getUserByEmail(normalizedAdminEmail)])
    );

    if (!subdomainAvailable) {
      return NextResponse.json(
        {
          success: false,
          message: 'Subdomain already exists',
          errors: {
            subdomain: ['This subdomain is already taken. Please choose another.'],
          },
        },
        { status: 400 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: 'Email already in use',
          errors: {
            adminEmail: ['This email is already registered. Please use a different email.'],
          },
        },
        { status: 400 }
      );
    }

    // Validate admin email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin email address.', errors: { adminEmail: ['Invalid email address'] } },
        { status: 400 }
      );
    }

    // Validate admin password length
    if (!admin.password || admin.password.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Admin password must be at least 8 characters.', errors: { adminPassword: ['Password must be at least 8 characters'] } },
        { status: 400 }
      );
    }

    // Validate optional settings fields against allowed values
    const VALID_TIMEZONES = new Set(['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Manila', 'Australia/Sydney']);
    const VALID_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'PHP', 'INR', 'SGD', 'MYR']);
    const VALID_DATE_FORMATS = new Set(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']);

    if (settings?.timezone && !VALID_TIMEZONES.has(settings.timezone)) {
      return NextResponse.json(
        { success: false, message: 'Invalid timezone.', errors: { timezone: ['Unsupported timezone'] } },
        { status: 400 }
      );
    }
    if (settings?.currency && !VALID_CURRENCIES.has(settings.currency)) {
      return NextResponse.json(
        { success: false, message: 'Invalid currency.', errors: { currency: ['Unsupported currency'] } },
        { status: 400 }
      );
    }
    if (settings?.dateFormat && !VALID_DATE_FORMATS.has(settings.dateFormat)) {
      return NextResponse.json(
        { success: false, message: 'Invalid date format.', errors: { dateFormat: ['Unsupported date format'] } },
        { status: 400 }
      );
    }

    // Create tenant with 7-day trial subscription
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7); // 7 days from now

    const tenantTimezone = settings?.timezone || 'UTC';
    const tenantCurrency = settings?.currency || 'USD';
    const tenantDateFormat = settings?.dateFormat || 'MM/DD/YYYY';

    const addressFields =
      address && (address.street || address.city || address.state || address.zipCode || address.country)
        ? {
            ...(address.street ? { addressStreet: address.street.trim() } : {}),
            ...(address.city ? { addressCity: address.city.trim() } : {}),
            ...(address.state ? { addressState: address.state.trim() } : {}),
            ...(address.zipCode ? { addressZipCode: address.zipCode.trim() } : {}),
            ...(address.country ? { addressCountry: address.country.trim() } : {}),
          }
        : {};

    // Tenant is the scoping root — create it under runAsSystem() per
    // lib/data/tenant.ts's convention.
    const tenant = await runAsSystem(() =>
      createTenant({
        name: name.trim(),
        subdomain: normalizedSubdomain,
        status: 'active',
        settingsTimezone: tenantTimezone,
        settingsCurrency: tenantCurrency,
        settingsDateFormat: tenantDateFormat,
        subscriptionPlan: 'trial',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: trialExpiresAt,
        ...(displayName ? { displayName: displayName.trim() } : {}),
        ...(email ? { email: email.toLowerCase().trim() } : {}),
        ...(phone ? { phone: phone.trim() } : {}),
        ...addressFields,
      })
    );

    // Everything below operates within this tenant's data — Role,
    // Permission, Admin, User, Settings are all DIRECTLY_SCOPED_MODELS
    // (lib/prisma-tenant-extension.ts), so this whole block runs under
    // runWithTenant(tenant.id, ...).
    const { createdRoles, adminUser, permissionCount } = await runWithTenant(tenant.id, async () => {
      // Create all roles with permissions (upsert — see lib/data/role.ts's
      // upsertRoleWithPermissions for why no "find role without tenantId"
      // migration-compat branch is needed anymore).
      const createdRoles = [];
      let permissionCount = 0;
      for (const roleData of ROLES_TO_CREATE) {
        const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[roleData.name];
        const role = await upsertRoleWithPermissions(
          tenant.id,
          appRoleToRoleName(roleData.name),
          { displayName: roleData.displayName, description: roleData.description, level: roleData.level },
          defaultPermissions
        );
        permissionCount += defaultPermissions.length;
        createdRoles.push(role);
      }

      const adminRole = createdRoles.find((r) => r.name === appRoleToRoleName('admin'));
      if (!adminRole) {
        throw new Error('Admin role not found after creation');
      }

      // Split admin name into first and last name
      const nameParts = admin.name.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Admin';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      // Check if Admin profile already exists
      let adminProfile = await getAdminByEmail(tenant.id, normalizedAdminEmail);
      if (!adminProfile) {
        adminProfile = await createAdmin({
          tenant: { connect: { id: tenant.id } },
          firstName,
          lastName,
          email: normalizedAdminEmail,
          phone: admin.phone || undefined,
          department: 'Administration',
          accessLevel: 'full',
          status: 'active',
        });
      }

      // Check if User already exists (defensive — already checked cross-tenant above)
      const existingUser = await getUserByEmail(normalizedAdminEmail, tenant.id);
      const hashedPassword = await bcrypt.hash(admin.password, 12);

      const adminUser = existingUser
        ? await updateUser(existingUser.id, {
            password: hashedPassword,
            role: { connect: { id: adminRole.id } },
            adminProfile: { connect: { id: adminProfile.id } },
            status: 'active',
          })
        : await createUser({
            name: admin.name.trim(),
            email: normalizedAdminEmail,
            password: hashedPassword,
            role: { connect: { id: adminRole.id } },
            tenant: { connect: { id: tenant.id } },
            adminProfile: { connect: { id: adminProfile.id } },
            status: 'active',
          });

      // Create tenant settings
      const clinicAddress = address?.street
        ? `${address.street}${address.city ? `, ${address.city}` : ''}${address.state ? `, ${address.state}` : ''}${address.zipCode ? ` ${address.zipCode}` : ''}`
        : '';

      await updateSettings(tenant.id, {
        clinicName: tenant.displayName || tenant.name,
        clinicAddress,
        clinicPhone: tenant.phone || '',
        clinicEmail: tenant.email || '',
        generalSettings: {
          timezone: tenantTimezone,
          dateFormat: tenantDateFormat,
          timeFormat: '12h',
          itemsPerPage: 20,
          enableAuditLog: true,
          sessionTimeoutMinutes: 480,
        },
        billingSettings: {
          currency: tenantCurrency,
          taxRate: 0,
          paymentTerms: 30,
          lateFeePercentage: 0,
          invoicePrefix: 'INV',
          allowPartialPayments: true,
        },
      });

      return { createdRoles, adminUser, permissionCount };
    });

    return NextResponse.json({
      success: true,
      message: 'Tenant created successfully with seed data',
      name: tenant.name,
      subdomain: tenant.subdomain,
      status: tenant.status,
      adminEmail: adminUser.email,
      seedData: {
        roles: createdRoles.length,
        permissions: permissionCount,
        settings: true,
      },
      subscription: {
        plan: tenant.subscriptionPlan || 'trial',
        status: tenant.subscriptionStatus || 'active',
        expiresAt: tenant.subscriptionExpiresAt,
      },
    });
  } catch (error: any) {
    const errorDetails = {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
      errorCode: error?.code,
      timestamp: new Date().toISOString(),
    };

    console.error('Error creating tenant:', errorDetails);

    // Handle Prisma unique-constraint violations (P2002) — the Postgres
    // equivalent of Mongo's E11000 duplicate key error.
    if (error?.code === 'P2002') {
      const field = Array.isArray(error?.meta?.target) ? error.meta.target[0] : 'field';
      return NextResponse.json(
        {
          success: false,
          message: `${field} already exists`,
          errors: {
            [field]: [`This ${field} is already taken`],
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to create tenant',
        errors: { general: ['An error occurred. Please try again.'] },
      },
      { status: 500 }
    );
  }
}
