import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import readline from 'readline';
import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';
import User from '../models/User';
import Role from '../models/Role';
import bcrypt from 'bcryptjs';

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

async function getOrCreateRole(roleName: string) {
  await connectDB();
  let role = await Role.findOne({ name: roleName });
  
  if (!role) {
    role = await Role.create({
      name: roleName,
      displayName: roleName.charAt(0).toUpperCase() + roleName.slice(1),
      isActive: true,
    });
    log(`Created ${roleName} role`, 'success');
  }
  
  return role;
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
    const currency = await question('Currency Code (default: PHP): ') || 'PHP';
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

    // Check if admin email already exists for this tenant
    await connectDB();
    const existingUser = await User.findOne({ 
      email: adminEmail.toLowerCase().trim(),
      tenantId: null // Check for users without tenant (we'll set tenantId after tenant creation)
    });
    
    if (existingUser) {
      log('Warning: A user with this email already exists (may be in another tenant)', 'warning');
      const proceed = await question('Continue anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
        log('Onboarding cancelled', 'info');
        rl.close();
        process.exit(0);
      }
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

    const tenantData: any = {
      name: tenantName.trim(),
      subdomain: subdomain!,
      status: 'active',
      settings: {
        timezone: timezone.trim() || 'UTC',
        currency: currency.trim().toUpperCase() || 'PHP',
        dateFormat: dateFormat.trim() || 'MM/DD/YYYY',
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
    log(`Tenant "${tenant.name}" created successfully`, 'success');

    // Step 8: Create Admin User
    log('Creating admin user...', 'info');
    
    const adminRole = await getOrCreateRole('admin');
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const adminUser = await User.create({
      name: adminName.trim(),
      email: adminEmail.toLowerCase().trim(),
      password: hashedPassword,
      role: adminRole._id,
      tenantId: tenant._id,
      status: 'active',
    });

    log(`Admin user "${adminUser.name}" created successfully`, 'success');

    // Step 9: Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Tenant Onboarding Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const rootDomain = process.env.ROOT_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const port = process.env.NODE_ENV === 'production' ? '' : ':3000';
    
    console.log('Tenant Details:');
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Subdomain: ${tenant.subdomain}`);
    console.log(`  Status: ${tenant.status}`);
    console.log(`  Access URL: ${protocol}://${tenant.subdomain}.${rootDomain}${port}`);
    console.log('\nAdmin User:');
    console.log(`  Name: ${adminUser.name}`);
    console.log(`  Email: ${adminUser.email}`);
    console.log(`  Role: admin`);
    console.log('\nNext Steps:');
    console.log('  1. Configure DNS (production):');
    console.log(`     ${tenant.subdomain}.${rootDomain} → Your server IP`);
    console.log('  2. Access the tenant:');
    console.log(`     ${protocol}://${tenant.subdomain}.${rootDomain}${port}`);
    console.log('  3. Log in with admin credentials');
    console.log('  4. Configure tenant settings');
    console.log('  5. Add additional staff members');
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

