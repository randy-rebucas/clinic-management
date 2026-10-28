import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import Medicine from '@/models/Medicine';
import Settings from '@/models/Settings';
import Admin from '@/models/Admin';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';
import { applyRateLimit, rateLimiters } from '@/lib/middleware/rate-limit';
import { buildSetPasswordUrl, generateInviteToken, inviteUpdate, randomUnusablePasswordHash, sendSetPasswordEmail } from '@/lib/user-invite';
import { turnstileRejection } from '@/lib/turnstile';
import { sendEmail } from '@/lib/email';

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
  // Names that would pass for the platform's own pages on a clinic subdomain (phishing).
  'login', 'signin', 'signup', 'auth', 'account', 'accounts', 'secure', 'security', 'pay', 'payment',
  'payments', 'billing', 'checkout', 'support', 'help', 'status', 'platform', 'console', 'dashboard',
  'portal', 'emcr', 'verify', 'docs', 'blog', 'static', 'assets', 'cdn', 'media', 'files', 'smtp',
  'email', 'webmail', 'ns1', 'ns2', 'root', 'system', 'official', 'myclinicsoft', 'devcom',
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

    const captcha = await turnstileRejection(request, body?.turnstileToken);
    if (captcha) return captcha;

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

    const isStr = (v: unknown): v is string => typeof v === 'string';
    if (
      (name !== undefined && !isStr(name)) ||
      (subdomain !== undefined && !isStr(subdomain)) ||
      (displayName !== undefined && displayName !== null && !isStr(displayName)) ||
      (email !== undefined && email !== null && !isStr(email)) ||
      (phone !== undefined && phone !== null && !isStr(phone)) ||
      (admin !== undefined && (typeof admin !== 'object' || admin === null)) ||
      (admin && ((admin.name !== undefined && !isStr(admin.name)) ||
        (admin.email !== undefined && !isStr(admin.email)) ||
        (admin.phone !== undefined && admin.phone !== null && !isStr(admin.phone))))
    ) {
      return NextResponse.json(
        { success: false, message: 'Invalid request body.', errors: { general: ['Invalid request format. Please try again.'] } },
        { status: 400 }
      );
    }
    if (address !== undefined && address !== null && (typeof address !== 'object' ||
      ['street', 'city', 'state', 'zipCode', 'country'].some((k) => address[k] !== undefined && address[k] !== null && !isStr(address[k])))) {
      return NextResponse.json(
        { success: false, message: 'Invalid address.', errors: { general: ['Invalid address.'] } },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!name || !subdomain || !admin?.name || !admin?.email) {
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

    await connectDB();

    // Check if subdomain already exists
    const existingTenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });
    if (existingTenant) {
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

    const adminEmail = admin.email.toLowerCase().trim();
    // What signup answers either way: whether the email already had an account is never said
    // (that would list who uses the platform); its owner hears about the attempt instead.
    const checkEmail = () =>
      NextResponse.json({
        success: true,
        message: 'Check your email to finish setting up',
        subdomain: subdomain.toLowerCase().trim(),
        adminEmail,
      });
    const emailInUse = async () => {
      await sendEmail({
        to: adminEmail,
        subject: 'You already have a MyClinicSoft account',
        html: '<p>Someone tried to register a new clinic with this email address, which already has an account. If it was you, sign in instead, or use “Forgot password” on the sign-in page. If it wasn’t you, you can ignore this email.</p>',
        text: 'Someone tried to register a new clinic with this email address, which already has an account. If it was you, sign in instead, or use "Forgot password" on the sign-in page. If it was not you, you can ignore this email.',
      }).catch(() => undefined);
      return checkEmail();
    };

    // Fast path; the authoritative check is the atomic insert below
    if (await User.exists({ email: adminEmail })) {
      return await emailInUse();
    }

    // Validate admin email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin.email)) {
      return NextResponse.json(
        { success: false, message: 'Invalid admin email address.', errors: { adminEmail: ['Invalid email address'] } },
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

    // Create tenant with 14-day trial subscription
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 14); // 14 days from now

    const tenantData: any = {
      name: name.trim(),
      subdomain: subdomain.toLowerCase().trim(),
      status: 'active',
      settings: {
        timezone: settings?.timezone || 'UTC',
        currency: settings?.currency || 'USD',
        dateFormat: settings?.dateFormat || 'MM/DD/YYYY',
      },
      subscription: {
        plan: 'trial',
        status: 'active',
        expiresAt: trialExpiresAt,
      },
    };

    if (displayName) {
      tenantData.displayName = displayName.trim();
    }

    if (email) {
      tenantData.email = email.toLowerCase().trim();
    }

    if (phone) {
      tenantData.phone = phone.trim();
    }

    if (address && (address.street || address.city || address.state || address.zipCode || address.country)) {
      tenantData.address = {};
      if (address.street) tenantData.address.street = address.street.trim();
      if (address.city) tenantData.address.city = address.city.trim();
      if (address.state) tenantData.address.state = address.state.trim();
      if (address.zipCode) tenantData.address.zipCode = address.zipCode.trim();
      if (address.country) tenantData.address.country = address.country.trim();
    }

    const tenant = await Tenant.create(tenantData);
    const tenantId = tenant._id;

    // Create all roles with permissions
    const rolesToCreate = [
      {
        name: 'admin',
        displayName: 'Administrator',
        description: 'Full system access with all permissions',
        level: 100,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS.admin,
      },
      {
        name: 'doctor',
        displayName: 'Doctor',
        description: 'Clinical staff with access to patient care, visits, and prescriptions',
        level: 80,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS.doctor,
      },
      {
        name: 'nurse',
        displayName: 'Nurse',
        description: 'Clinical staff with access to patient care and lab results',
        level: 60,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS.nurse,
      },
      {
        name: 'receptionist',
        displayName: 'Receptionist',
        description: 'Front desk staff with access to appointments and patient management',
        level: 40,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS.receptionist,
      },
      {
        name: 'accountant',
        displayName: 'Accountant',
        description: 'Financial staff with access to billing and invoices',
        level: 30,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS.accountant,
      },
      {
        name: 'medical-technologist',
        displayName: 'Medical technologist',
        description: 'Laboratory staff who receive lab requests and enter results',
        level: 50,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS['medical-technologist'],
      },
    ];

    // Every tenant gets its own role documents. Shared/global roles are never re-assigned
    // to a tenant, which would silently move other tenants' users into this one.
    const createdRoles: any[] = [];
    for (const roleData of rolesToCreate) {
      let role;
      try {
        role = await Role.create({
          name: roleData.name,
          tenantId,
          displayName: roleData.displayName,
          description: roleData.description,
          level: roleData.level,
          isActive: true,
          defaultPermissions: roleData.defaultPermissions,
        });
      } catch (error: any) {
        if (error.code === 11000 || error.message?.includes('duplicate key')) {
          role = await Role.findOne({ name: roleData.name, tenantId });
          if (!role) {
            // A legacy unique index on `name` alone prevents tenant-scoped roles
            throw new Error(`Failed to create role ${roleData.name} for tenant (duplicate key on a non-tenant index)`);
          }
        } else {
          throw error;
        }
      }

      // Clear existing permissions for this role
      await Permission.deleteMany({ role: role._id, tenantId });

      // Create Permission documents for this role
      const permissions = [];
      try {
        for (const perm of role.defaultPermissions || []) {
          const permission = await Permission.create({
            role: role._id,
            tenantId,
            resource: perm.resource,
            actions: perm.actions,
          });
          permissions.push(permission._id);
        }
        // Update role with Permission document references
        role.permissions = permissions;
        await role.save();
      } catch (error: any) {
        console.error(`Error creating permissions for ${roleData.name} role:`, error.message);
      }

      createdRoles.push(role);
    }

    // Get admin role for user creation
    const adminRole = createdRoles.find(r => r.name === 'admin');
    if (!adminRole) {
      throw new Error('Admin role not found after creation');
    }

    // Split admin name into first and last name
    const nameParts = admin.name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const rollbackTenant = async () => {
      await Promise.allSettled([
        Permission.deleteMany({ tenantId }),
        Role.deleteMany({ tenantId }),
        Admin.deleteMany({ tenantId }),
        Tenant.deleteOne({ _id: tenantId }),
      ]);
    };

    // Create the admin user only if no user with this email exists. $setOnInsert never
    // touches an existing document, so a concurrent signup or pre-existing account
    // can't have its password, role or tenant overwritten.
    // The account can't be used until its owner sets a password from the emailed link, which
    // also proves they hold the address.
    const invite = generateInviteToken();
    const upsert = await User.findOneAndUpdate(
      { email: adminEmail },
      {
        $setOnInsert: {
          name: admin.name.trim(),
          email: adminEmail,
          password: await randomUnusablePasswordHash(),
          mustSetPassword: true,
          ...inviteUpdate(invite),
          role: adminRole._id,
          tenantId: tenant._id,
          status: 'active',
          sessionVersion: 0,
        },
      },
      { upsert: true, new: true, includeResultMetadata: true, runValidators: true, setDefaultsOnInsert: true }
    );
    const insertedUser = upsert.lastErrorObject?.updatedExisting === false ? upsert.value : null;
    if (!insertedUser) {
      await rollbackTenant();
      return await emailInUse();
    }
    const adminUser = insertedUser;

    // The Admin post-save hook links to the existing user by email instead of creating one
    let adminProfile;
    try {
      adminProfile = await Admin.create({
        tenantId: tenant._id,
        firstName: firstName,
        lastName: lastName,
        email: adminEmail,
        phone: admin.phone || undefined,
        department: 'Administration',
        accessLevel: 'full',
        status: 'active',
      });
    } catch (adminError: any) {
      console.error('Error creating Admin profile:', adminError);
      await User.deleteOne({ _id: adminUser._id });
      await rollbackTenant();
      throw new Error('Failed to create Admin profile');
    }

    await User.updateOne(
      { _id: adminUser._id, tenantId: tenant._id },
      { $set: { adminProfile: adminProfile._id } }
    );

    // Verify user can be retrieved
    const verifyUser = await User.findById(adminUser._id)
      .populate('role', 'name')
      .populate('adminProfile');
    if (!verifyUser) {
      throw new Error('User was created but cannot be retrieved from database');
    }

    // Create tenant settings
    const clinicAddress = tenant.address?.street
      ? `${tenant.address.street}${tenant.address.city ? `, ${tenant.address.city}` : ''}${tenant.address.state ? `, ${tenant.address.state}` : ''}${tenant.address.zipCode ? ` ${tenant.address.zipCode}` : ''}`
      : '';

    await Settings.create({
      tenantId,
      clinicName: tenant.displayName || tenant.name,
      clinicAddress: clinicAddress,
      clinicPhone: tenant.phone || '',
      clinicEmail: tenant.email || '',
      clinicWebsite: '',
      taxId: '',
      licenseNumber: '',
      ptr: '',
      generalSettings: {
        timezone: tenant.settings?.timezone || 'UTC',
        dateFormat: tenant.settings?.dateFormat || 'MM/DD/YYYY',
        timeFormat: '12h',
        itemsPerPage: 20,
        enableAuditLog: true,
        sessionTimeoutMinutes: 480,
      },
      billingSettings: {
        currency: tenant.settings?.currency || 'USD',
        taxRate: 0,
        paymentTerms: 30,
        lateFeePercentage: 0,
        invoicePrefix: 'INV',
        allowPartialPayments: true,
      },
    });

    const delivery = await sendSetPasswordEmail({ email: adminEmail, name: admin.name.trim(), token: invite.token, tenantId: tenant._id, kind: 'invite' });
    if (delivery !== 'sent' && process.env.NODE_ENV !== 'production') {
      // Local setups often have no SMTP; the link is the only way into the new clinic.
      console.info(`[onboard] Set-password link for the new clinic admin: ${buildSetPasswordUrl(invite.token, tenant.subdomain)}`);
    }

    return checkEmail();
  } catch (error: any) {
    // Type guard for MongoDB errors
    const isMongoError = error && typeof error === 'object' && 'code' in error;
    const mongoError = isMongoError ? error as { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> } : null;

    // No key values or messages: a duplicate-key error carries the email or subdomain entered.
    console.error('Error creating tenant:', {
      name: error?.name,
      code: mongoError?.code,
      keyPattern: mongoError?.keyPattern,
      stack: mongoError?.code === 11000 ? undefined : error?.stack,
    });

    // Handle duplicate key errors
    if (mongoError?.code === 11000 || error.message?.includes('duplicate key')) {
      const field = mongoError?.keyPattern ? Object.keys(mongoError.keyPattern)[0] : 'field';

      return NextResponse.json(
        {
          success: false,
          message: `That ${field} is already taken`,
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

