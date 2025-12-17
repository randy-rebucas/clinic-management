import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import readline from 'readline';
import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';
import User from '../models/User';
import Role from '../models/Role';
import Permission from '../models/Permission';
import Medicine from '../models/Medicine';
import Settings from '../models/Settings';
import Admin from '../models/Admin';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_PERMISSIONS } from '../lib/permissions';

// Load environment variables
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

function log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
  };
  console.log(`${icons[type]} ${message}`);
}

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

async function checkSubdomainExists(subdomain: string): Promise<boolean> {
  await connectDB();
  const existing = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });
  return !!existing;
}

async function createRolesWithPermissions(tenantId: mongoose.Types.ObjectId) {
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
      name: 'medical-representative',
      displayName: 'Medical Representative',
      description: 'External medical representatives with limited access',
      level: 20,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS['medical-representative'],
    },
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
        log(`Duplicate key error for role ${roleData.name}, attempting to find existing role...`, 'warning');
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
      log(`Error creating permissions for ${roleData.name} role: ${error.message}`, 'error');
    }

    createdRoles.push(role);
    log(`Created/updated ${roleData.name} role with ${permissions.length} permissions`, 'success');
  }

  return createdRoles;
}

async function onboardTenant() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏥 Tenant Onboarding Wizard');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Step 1: Tenant Information
    log('Step 1: Tenant Information', 'info');
    const tenantName = await question('Tenant/Clinic Name: ');
    if (!tenantName || tenantName.trim().length < 2) {
      log('Tenant name is required (min 2 characters)', 'error');
      rl.close();
      process.exit(1);
    }

    const displayName = await question('Display Name (optional, press Enter to use tenant name): ');
    
    // Step 2: Subdomain
    log('\nStep 2: Subdomain Configuration', 'info');
    let subdomain: string = '';
    let subdomainValid = false;
    
    while (!subdomainValid) {
      subdomain = (await question('Subdomain (e.g., "citymedical"): ')).toLowerCase().trim();
      
      const validation = validateSubdomain(subdomain);
      if (!validation.valid) {
        log(validation.error || 'Invalid subdomain', 'error');
        continue;
      }
      
      const exists = await checkSubdomainExists(subdomain);
      if (exists) {
        log(`Subdomain "${subdomain}" already exists. Please choose another.`, 'error');
        continue;
      }
      
      subdomainValid = true;
    }

    log(`Subdomain will be: ${subdomain}.${process.env.ROOT_DOMAIN || 'localhost'}`, 'info');

    // Step 3: Contact Information
    log('\nStep 3: Contact Information', 'info');
    const email = await question('Contact Email (optional): ');
    const phone = await question('Contact Phone (optional): ');

    // Step 4: Address (optional)
    log('\nStep 4: Address (optional, press Enter to skip)', 'info');
    const street = await question('Street Address: ');
    const city = await question('City: ');
    const state = await question('State/Province: ');
    const zipCode = await question('Zip/Postal Code: ');
    const country = await question('Country: ');

    // Step 5: Settings
    log('\nStep 5: Tenant Settings', 'info');
    const timezone = await question('Timezone (default: UTC): ') || 'UTC';
    const currency = await question('Currency Code (default: USD): ') || 'USD';
    const dateFormat = await question('Date Format (default: MM/DD/YYYY): ') || 'MM/DD/YYYY';

    // Step 6: Admin User
    log('\nStep 6: Create Admin User', 'info');
    const adminName = await question('Admin Full Name: ');
    if (!adminName || adminName.trim().length < 2) {
      log('Admin name is required', 'error');
      rl.close();
      process.exit(1);
    }

    const adminEmail = await question('Admin Email: ');
    if (!adminEmail || !/^\S+@\S+\.\S+$/.test(adminEmail)) {
      log('Valid admin email is required', 'error');
      rl.close();
      process.exit(1);
    }

    // Check if admin email already exists (within any tenant)
    await connectDB();
    const existingUser = await User.findOne({ 
      email: adminEmail.toLowerCase().trim(),
    });
    
    if (existingUser) {
      log('Error: This email is already registered. Please use a different email.', 'error');
      rl.close();
      process.exit(1);
    }

    const adminPassword = await question('Admin Password (min 8 characters): ');
    if (!adminPassword || adminPassword.length < 8) {
      log('Password must be at least 8 characters long', 'error');
      rl.close();
      process.exit(1);
    }

    // Step 7: Create Tenant
    log('\nCreating tenant...', 'info');
    await connectDB();

    // Create tenant with 7-day trial subscription
    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 7); // 7 days from now

    const tenantData: any = {
      name: tenantName.trim(),
      subdomain: subdomain!,
      status: 'active',
      settings: {
        timezone: timezone.trim() || 'UTC',
        currency: currency.trim().toUpperCase() || 'USD',
        dateFormat: dateFormat.trim() || 'MM/DD/YYYY',
      },
      subscription: {
        plan: 'trial',
        status: 'active',
        expiresAt: trialExpiresAt,
      },
    };

    if (displayName && displayName.trim()) {
      tenantData.displayName = displayName.trim();
    }

    if (email && email.trim()) {
      tenantData.email = email.trim().toLowerCase();
    }

    if (phone && phone.trim()) {
      tenantData.phone = phone.trim();
    }

    if (street || city || state || zipCode || country) {
      tenantData.address = {};
      if (street) tenantData.address.street = street.trim();
      if (city) tenantData.address.city = city.trim();
      if (state) tenantData.address.state = state.trim();
      if (zipCode) tenantData.address.zipCode = zipCode.trim();
      if (country) tenantData.address.country = country.trim();
    }

    const tenant = await Tenant.create(tenantData);
    const tenantId = tenant._id;
    log(`Tenant "${tenant.name}" created successfully`, 'success');
    log(`Trial subscription expires: ${trialExpiresAt.toLocaleDateString()}`, 'info');

    // Step 8: Create Roles with Permissions
    log('\nCreating roles and permissions...', 'info');
    const createdRoles = await createRolesWithPermissions(tenantId);
    log(`Created ${createdRoles.length} roles with permissions`, 'success');

    // Get admin role for user creation
    const adminRole = createdRoles.find(r => r.name === 'admin');
    if (!adminRole) {
      log('Admin role not found after creation', 'error');
      rl.close();
      process.exit(1);
    }

    // Step 9: Create Admin Profile and User
    log('\nCreating admin profile and user...', 'info');
    
    // Split admin name into first and last name
    const nameParts = adminName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // Check if Admin already exists (from Tenant post-save hook)
    let adminProfile = await Admin.findOne({ 
      tenantId: tenant._id,
      email: adminEmail.toLowerCase().trim(),
    });

    if (!adminProfile) {
      // Create Admin profile first
      log('Creating Admin profile...', 'info');
      try {
        adminProfile = await Admin.create({
          tenantId: tenant._id,
          firstName: firstName,
          lastName: lastName,
          email: adminEmail.toLowerCase().trim(),
          phone: phone || undefined,
          department: 'Administration',
          accessLevel: 'full',
          status: 'active',
        });
        log('Admin profile created successfully', 'success');
      } catch (adminError: any) {
        log(`Error creating Admin profile: ${adminError.message}`, 'error');
        rl.close();
        process.exit(1);
      }
    } else {
      log('Admin profile already exists', 'info');
    }

    // Check if User already exists (might have been created by Admin post-save hook)
    let adminUser = await User.findOne({ 
      email: adminEmail.toLowerCase().trim(),
    });

    if (!adminUser) {
      // Create User manually with the provided password
      log('Creating User account...', 'info');
      try {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        adminUser = await User.create({
          name: adminName.trim(),
          email: adminEmail.toLowerCase().trim(),
          password: hashedPassword,
          role: adminRole._id,
          tenantId: tenant._id,
          adminProfile: adminProfile._id,
          status: 'active',
        });
        log(`Admin user "${adminUser.name}" created successfully`, 'success');
      } catch (userError: any) {
        log(`Error creating User: ${userError.message}`, 'error');
        rl.close();
        process.exit(1);
      }
    } else {
      // User exists, update password and link to admin profile if needed
      log('User already exists, updating password and profile link...', 'info');
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      adminUser.password = hashedPassword;
      adminUser.role = adminRole._id;
      adminUser.tenantId = tenant._id;
      adminUser.adminProfile = adminProfile._id;
      adminUser.status = 'active';
      await adminUser.save();
      log('User updated successfully', 'success');
    }

    // Step 10: Create Default Medicines
    log('\nCreating default medicines...', 'info');
    const medicinesData = [
      { name: 'Paracetamol', genericName: 'Acetaminophen', form: 'tablet', strength: '500 mg', category: 'Analgesic' },
      { name: 'Amoxicillin', genericName: 'Amoxicillin', form: 'capsule', strength: '250 mg', category: 'Antibiotic' },
      { name: 'Ibuprofen', genericName: 'Ibuprofen', form: 'tablet', strength: '400 mg', category: 'NSAID' },
      { name: 'Omeprazole', genericName: 'Omeprazole', form: 'capsule', strength: '20 mg', category: 'PPI' },
      { name: 'Loratadine', genericName: 'Loratadine', form: 'tablet', strength: '10 mg', category: 'Antihistamine' },
    ];

    for (const medData of medicinesData) {
      await Medicine.create({
        ...medData,
        tenantId,
        unit: 'mg',
        route: 'oral',
        indications: ['Pain relief', 'Fever'],
        standardDosage: medData.strength,
        standardFrequency: 'BID',
        requiresPrescription: true,
        active: true,
      });
    }
    log(`Created ${medicinesData.length} default medicines`, 'success');

    // Step 11: Create Tenant Settings
    log('\nCreating tenant settings...', 'info');
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
    log('Tenant settings created successfully', 'success');

    // Step 12: Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Tenant Onboarding Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const rootDomain = process.env.ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const port = process.env.NODE_ENV === 'production' ? '' : ':3000';
    
    console.log('Tenant Details:');
    console.log(`  Name: ${tenant.name}`);
    if (tenant.displayName) {
      console.log(`  Display Name: ${tenant.displayName}`);
    }
    console.log(`  Subdomain: ${tenant.subdomain}`);
    console.log(`  Status: ${tenant.status}`);
    console.log(`  Access URL: ${protocol}://${tenant.subdomain}.${rootDomain}${port}`);
    console.log(`  Subscription: ${tenant.subscription?.plan || 'trial'} (expires: ${trialExpiresAt.toLocaleDateString()})`);
    
    console.log('\nAdmin User:');
    console.log(`  Name: ${adminUser.name}`);
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Role: admin`);
    
    const totalPermissions = createdRoles.reduce((sum, role) => sum + (role.permissions?.length || 0), 0);
    console.log('\nSeed Data Created:');
    console.log(`  Roles: ${createdRoles.length} (admin, doctor, nurse, receptionist, accountant, medical-representative)`);
    console.log(`  Permissions: ${totalPermissions}`);
    console.log(`  Medicines: ${medicinesData.length}`);
    console.log(`  Settings: ✓`);
    
    console.log('\nNext Steps:');
    console.log('  1. Configure DNS (production):');
    console.log(`     ${tenant.subdomain}.${rootDomain} → Your server IP`);
    console.log('  2. Access the tenant:');
    console.log(`     ${protocol}://${tenant.subdomain}.${rootDomain}${port}`);
    console.log('  3. Log in with admin credentials');
    console.log('  4. Review and configure tenant settings');
    console.log('  5. Add additional staff members');
    console.log('  6. Review subscription plan before trial expires');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    rl.close();
    process.exit(0);
  } catch (error: any) {
    log(`Error during onboarding: ${error.message}`, 'error');
    console.error(error);
    rl.close();
    process.exit(1);
  }
}

// Run onboarding
onboardTenant();

