import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import User from '@/models/User';
import Role from '@/models/Role';
import Permission from '@/models/Permission';
import Medicine from '@/models/Medicine';
import Settings from '@/models/Settings';
import Admin from '@/models/Admin';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/permissions';

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

export async function POST(request: NextRequest) {
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
    console.log('Received onboarding request:', {
      hasName: !!body.name,
      hasSubdomain: !!body.subdomain,
      hasAdmin: !!body.admin,
      hasAdminName: !!body.admin?.name,
      hasAdminEmail: !!body.admin?.email,
      hasAdminPassword: !!body.admin?.password,
    });

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
    console.log('Onboarding data:', {
      name: name ? `${name.substring(0, 20)}...` : 'missing',
      subdomain: subdomain ? `${subdomain.substring(0, 20)}...` : 'missing',
      hasAdmin: !!admin,
      adminName: admin?.name ? `${admin.name.substring(0, 20)}...` : 'missing',
      adminEmail: admin?.email ? `${admin.email.substring(0, 20)}...` : 'missing',
      adminPassword: admin?.password,
    });
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
      console.error('Request body received:', {
        name: name ? `${name.substring(0, 20)}...` : 'missing',
        subdomain: subdomain ? `${subdomain.substring(0, 20)}...` : 'missing',
        hasAdmin: !!admin,
        adminName: admin?.name ? `${admin.name.substring(0, 20)}...` : 'missing',
        adminEmail: admin?.email ? `${admin.email.substring(0, 20)}...` : 'missing',
        hasAdminPassword: !!admin?.password,
      });

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

    // Check if admin email already exists (within any tenant)
    const existingUser = await User.findOne({
      email: admin.email.toLowerCase().trim(),
    });
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

    // Create tenant with 7-day trial subscription
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7); // 7 days from now

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
    console.log('Creating roles and permissions...');
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
      }
    ];

    const createdRoles: any[] = [];
    for (const roleData of rolesToCreate) {
      let role;
      try {
        // First, try to find existing role with tenantId
        role = await Role.findOne({ name: roleData.name, tenantId });

        if (!role) {
          // If not found, check for role without tenantId (backward compatibility)
          const existingRoleWithoutTenant = await Role.findOne({
            name: roleData.name,
            $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
          });

          if (existingRoleWithoutTenant) {
            // Update existing role to include tenantId
            existingRoleWithoutTenant.tenantId = tenantId;
            existingRoleWithoutTenant.displayName = roleData.displayName;
            existingRoleWithoutTenant.description = roleData.description;
            existingRoleWithoutTenant.level = roleData.level;
            existingRoleWithoutTenant.isActive = true;
            existingRoleWithoutTenant.defaultPermissions = roleData.defaultPermissions;
            await existingRoleWithoutTenant.save();
            role = existingRoleWithoutTenant;
          } else {
            // Create new role
            role = await Role.create({
              name: roleData.name,
              tenantId,
              displayName: roleData.displayName,
              description: roleData.description,
              level: roleData.level,
              isActive: true,
              defaultPermissions: roleData.defaultPermissions,
            });
          }
        } else {
          // Update existing role
          role.displayName = roleData.displayName;
          role.description = roleData.description;
          role.level = roleData.level;
          role.isActive = true;
          role.defaultPermissions = roleData.defaultPermissions;
          await role.save();
        }
      } catch (error: any) {
        // Handle duplicate key errors
        if (error.code === 11000 || error.message?.includes('duplicate key')) {
          console.warn(`Duplicate key error for role ${roleData.name}, attempting to find existing role...`);
          // Try to find the existing role
          role = await Role.findOne({ name: roleData.name, tenantId });
          if (!role) {
            // Try without tenantId
            role = await Role.findOne({
              name: roleData.name,
              $or: [{ tenantId: { $exists: false } }, { tenantId: null }]
            });
            if (role) {
              // Update to include tenantId
              role.tenantId = tenantId;
              await role.save();
            }
          }

          if (!role) {
            throw new Error(`Failed to create or find role ${roleData.name}: ${error.message}`);
          }

          // Update role properties
          role.displayName = roleData.displayName;
          role.description = roleData.description;
          role.level = roleData.level;
          role.isActive = true;
          role.defaultPermissions = roleData.defaultPermissions;
          await role.save();
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

    console.log('Creating admin profile and user...');

    // Validate admin password
    if (!admin.password || admin.password.length < 8) {
      throw new Error('Admin password must be at least 8 characters long');
    }

    // Split admin name into first and last name
    const nameParts = admin.name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // Check if Admin already exists (from Tenant post-save hook)
    let adminProfile = await Admin.findOne({
      tenantId: tenant._id,
      email: admin.email.toLowerCase().trim(),
    });

    if (!adminProfile) {
      // Create Admin profile first
      console.log('Creating Admin profile...');
      try {
        adminProfile = await Admin.create({
          tenantId: tenant._id,
          firstName: firstName,
          lastName: lastName,
          email: admin.email.toLowerCase().trim(),
          phone: admin.phone || undefined,
          department: 'Administration',
          accessLevel: 'full',
          status: 'active',
        });
        console.log('✅ Admin profile created:', adminProfile._id.toString());
      } catch (adminError: any) {
        console.error('❌ Error creating Admin profile:', adminError);
        throw new Error(`Failed to create Admin profile: ${adminError.message}`);
      }
    } else {
      console.log('ℹ️  Admin profile already exists:', adminProfile._id.toString());
    }

    // Check if User already exists (might have been created by Admin post-save hook)
    let adminUser = await User.findOne({
      email: admin.email.toLowerCase().trim(),
    });

    if (!adminUser) {
      // Create User manually with the provided password
      console.log('Creating User account...');
      try {
        console.log('Hashing password and creating user...', admin.password);
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        console.log('Password hashed, creating user document...', hashedPassword);

        adminUser = await User.create({
          name: admin.name.trim(),
          email: admin.email.toLowerCase().trim(),
          password: hashedPassword,
          role: adminRole._id,
          tenantId: tenant._id,
          adminProfile: adminProfile._id,
          status: 'active',
        });
        console.log('✅ User created successfully:', {
          id: adminUser._id.toString(),
          email: adminUser.email,
          role: adminRole.name,
        });
      } catch (userError: any) {
        console.error('❌ Error creating User:', userError);
        console.error('Error details:', {
          message: userError.message,
          name: userError.name,
          code: userError.code,
          keyPattern: userError.keyPattern,
          keyValue: userError.keyValue,
        });

        // If it's a duplicate key error, provide a better message
        if (userError.code === 11000) {
          const field = Object.keys(userError.keyPattern || {})[0] || 'field';
          throw new Error(`User with this ${field} already exists`);
        }

        throw new Error(`Failed to create User: ${userError.message}`);
      }
    } else {
      // User exists, update password and link to admin profile if needed
      console.log('ℹ️  User already exists, updating password and profile link...');
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      adminUser.password = hashedPassword;
      adminUser.role = adminRole._id;
      adminUser.tenantId = tenant._id;
      adminUser.adminProfile = adminProfile._id;
      adminUser.status = 'active';
      await adminUser.save();
      console.log('✅ User updated successfully');
    }

    // Verify user was created/updated
    if (!adminUser || !adminUser._id) {
      throw new Error('User creation/update failed - user object is invalid');
    }

    // Verify user can be retrieved
    const verifyUser = await User.findById(adminUser._id)
      .populate('role', 'name')
      .populate('adminProfile');
    if (!verifyUser) {
      throw new Error('User was created but cannot be retrieved from database');
    }

    console.log('✅ User verified in database:', {
      id: verifyUser._id.toString(),
      email: verifyUser.email,
      role: (verifyUser as any).role?.name,
      hasAdminProfile: !!(verifyUser as any).adminProfile,
    });

    // Create tenant settings
    console.log('Creating tenant settings...');
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

    console.log('Seed data creation completed');

    return NextResponse.json({
      success: true,
      message: 'Tenant created successfully with seed data',
      name: tenant.name,
      subdomain: tenant.subdomain,
      status: tenant.status,
      adminEmail: adminUser.email,
      seedData: {
        roles: createdRoles.length,
        permissions: createdRoles.reduce((sum, role) => sum + (role.permissions?.length || 0), 0),
        settings: true,
      },
      subscription: {
        plan: tenant.subscription?.plan || 'trial',
        status: tenant.subscription?.status || 'active',
        expiresAt: tenant.subscription?.expiresAt,
      },
    });
  } catch (error: any) {
    // Type guard for MongoDB errors
    const isMongoError = error && typeof error === 'object' && 'code' in error;
    const mongoError = isMongoError ? error as { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> } : null;

    // Create detailed error information for logging
    const errorDetails = {
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : String(error),
      errorCode: mongoError?.code,
      keyPattern: mongoError?.keyPattern,
      keyValue: mongoError?.keyValue,
      errorStringified: error instanceof Error
        ? JSON.stringify({
          name: error.name,
          message: error.message,
          code: mongoError?.code,
          keyPattern: mongoError?.keyPattern,
          keyValue: mongoError?.keyValue,
          stack: error.stack,
        }, null, 2)
        : JSON.stringify(error, null, 2),
      timestamp: new Date().toISOString(),
    };

    console.error('Error creating tenant:', errorDetails);
    console.error('Error details (stringified):', errorDetails.errorStringified);

    // Handle duplicate key errors
    if (mongoError?.code === 11000 || error.message?.includes('duplicate key')) {
      const field = mongoError?.keyPattern ? Object.keys(mongoError.keyPattern)[0] : 'field';
      const value = mongoError?.keyValue ? Object.values(mongoError.keyValue)[0] : 'value';

      return NextResponse.json(
        {
          success: false,
          message: `${field} "${value}" already exists`,
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
        errors: {
          general: [error.message || 'An error occurred. Please try again.'],
        },
      },
      { status: 500 }
    );
  }
}

