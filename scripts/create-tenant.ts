/**
 * Script to create a new tenant
 * 
 * Usage: tsx scripts/create-tenant.ts <name> <slug> [displayName]
 * 
 * Example: tsx scripts/create-tenant.ts "Clinic ABC" "clinic-abc" "ABC Medical Clinic"
 */

import 'dotenv/config';
import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';

async function createTenant() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.error('Usage: tsx scripts/create-tenant.ts <name> <slug> [displayName]');
      console.error('Example: tsx scripts/create-tenant.ts "Clinic ABC" "clinic-abc" "ABC Medical Clinic"');
      process.exit(1);
    }

    const [name, slug, displayName] = args;

    await connectDB();
    console.log('✅ Connected to database');

    // Check if tenant with this slug already exists
    const existing = await Tenant.findOne({ slug });
    if (existing) {
      console.error(`❌ Tenant with slug "${slug}" already exists`);
      process.exit(1);
    }

    // Create tenant
    const tenant = await Tenant.create({
      name,
      slug,
      displayName: displayName || name,
      status: 'active',
    });

    console.log('\n✅ Tenant created successfully!');
    console.log('\n📋 Tenant Details:');
    console.log(`   ID: ${tenant._id}`);
    console.log(`   Name: ${tenant.name}`);
    console.log(`   Slug: ${tenant.slug}`);
    console.log(`   Display Name: ${tenant.displayName || tenant.name}`);
    console.log(`   Status: ${tenant.status}`);
    
    console.log('\n🌐 Access URLs:');
    console.log(`   Subdomain: https://${slug}.yourdomain.com`);
    console.log(`   Path: https://yourdomain.com/t/${slug}`);
    console.log(`   Header: X-Tenant-Slug: ${slug}`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Configure DNS for subdomain routing (if using subdomains)');
    console.log('2. Create admin user for this tenant');
    console.log('3. Configure tenant settings');
    
  } catch (error: any) {
    console.error('❌ Error creating tenant:', error.message);
    if (error.code === 11000) {
      console.error('   A tenant with this slug already exists');
    }
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run script
createTenant();

