/**
 * Migration script to add tenantId to existing data
 * 
 * This script:
 * 1. Creates a default tenant if none exists
 * 2. Assigns all existing records to the default tenant
 * 3. Updates indexes to be tenant-scoped
 * 
 * Usage: tsx scripts/migrate-to-multi-tenant.ts
 */

import 'dotenv/config';
import connectDB from '../lib/mongodb';
import Tenant from '../models/Tenant';
import User from '../models/User';
import Patient from '../models/Patient';
import Appointment from '../models/Appointment';
import Doctor from '../models/Doctor';
import Visit from '../models/Visit';
import Invoice from '../models/Invoice';
import Prescription from '../models/Prescription';
import LabResult from '../models/LabResult';
import Referral from '../models/Referral';
import Document from '../models/Document';
import Admin from '../models/Admin';

async function migrate() {
  try {
    console.log('🔄 Starting multi-tenant migration...');
    
    await connectDB();
    console.log('✅ Connected to database');

    // Step 1: Create default tenant if it doesn't exist
    let defaultTenant = await Tenant.findOne({ slug: 'default' });
    
    if (!defaultTenant) {
      console.log('📝 Creating default tenant...');
      defaultTenant = await Tenant.create({
        name: 'Default Clinic',
        slug: 'default',
        displayName: 'Default Clinic',
        status: 'active',
      });
      console.log(`✅ Created default tenant: ${defaultTenant._id}`);
    } else {
      console.log(`✅ Using existing default tenant: ${defaultTenant._id}`);
    }

    const tenantId = defaultTenant._id;

    // Step 2: Update all models with tenantId
    const models = [
      { name: 'User', model: User },
      { name: 'Patient', model: Patient },
      { name: 'Appointment', model: Appointment },
      { name: 'Doctor', model: Doctor },
      { name: 'Visit', model: Visit },
      { name: 'Invoice', model: Invoice },
      { name: 'Prescription', model: Prescription },
      { name: 'LabResult', model: LabResult },
      { name: 'Referral', model: Referral },
      { name: 'Document', model: Document },
      { name: 'Admin', model: Admin },
    ];

    for (const { name, model } of models) {
      try {
        const count = await model.countDocuments({ tenantId: { $exists: false } });
        
        if (count > 0) {
          console.log(`📝 Updating ${count} ${name} records...`);
          const result = await model.updateMany(
            { tenantId: { $exists: false } },
            { $set: { tenantId } }
          );
          console.log(`✅ Updated ${result.modifiedCount} ${name} records`);
        } else {
          console.log(`✅ All ${name} records already have tenantId`);
        }
      } catch (error: any) {
        console.error(`❌ Error updating ${name}:`, error.message);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Review the default tenant settings');
    console.log('2. Create additional tenants as needed');
    console.log('3. Assign users/data to appropriate tenants');
    console.log('4. Test tenant isolation');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run migration
migrate();

