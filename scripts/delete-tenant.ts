import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose, { Types } from 'mongoose';
import readline from 'readline';
import connectDB from '../lib/mongodb';
import { registerAllModels } from '../models';
import Tenant from '../models/Tenant';
import {
  // Audit & Notifications
  AuditLog,
  Notification,
  // Queue & Membership
  Queue,
  Membership,
  // Documents & Referrals
  Referral,
  Document,
  // Billing
  Invoice,
  // Clinical records
  Procedure,
  Imaging,
  LabResult,
  Prescription,
  Visit,
  Appointment,
  // Inventory & Catalog
  InventoryItem,
  Medicine,
  Service,
  Room,
  Specialization,
  // Patient
  Patient,
  // Profile models
  MedicalRepresentative,
  Accountant,
  Receptionist,
  Nurse,
  Doctor,
  Admin,
  Staff,
  // Auth
  User,
  Permission,
  Role,
  // Settings
  Settings,
} from '../models';

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

/**
 * All collections that have a tenantId field referencing the Tenant model
 * These collections store data that belongs to a specific tenant.
 * We delete all documents where tenantId matches the tenant being deleted.
 * 
 * Collections are ordered by dependency (dependent records first, then their dependencies)
 */
const TENANT_SCOPED_COLLECTIONS = [
  // Audit & Notifications (can reference users/patients)
  { model: AuditLog, name: 'auditlogs' },
  { model: Notification, name: 'notifications' },
  // Queue & Membership (can reference patients/appointments)
  { model: Queue, name: 'queues' },
  { model: Membership, name: 'memberships' },
  // Documents & Referrals (can reference patients/visits/appointments)
  { model: Referral, name: 'referrals' },
  { model: Document, name: 'documents' },
  // Billing (can reference patients/visits)
  { model: Invoice, name: 'invoices' },
  // Clinical records (can reference patients/visits)
  { model: Procedure, name: 'procedures' },
  { model: Imaging, name: 'imaging' },
  { model: LabResult, name: 'labresults' },
  { model: Prescription, name: 'prescriptions' },
  { model: Visit, name: 'visits' },
  { model: Appointment, name: 'appointments' },
  // Inventory & Catalog
  { model: InventoryItem, name: 'inventoryitems' },
  { model: Medicine, name: 'medicines' },
  { model: Service, name: 'services' },
  { model: Room, name: 'rooms' },
  { model: Specialization, name: 'specializations' },
  // Patient (core entity)
  { model: Patient, name: 'patients' },
  // Profile models (can reference users)
  { model: MedicalRepresentative, name: 'medicalrepresentatives' },
  { model: Accountant, name: 'accountants' },
  { model: Receptionist, name: 'receptionists' },
  { model: Nurse, name: 'nurses' },
  { model: Doctor, name: 'doctors' },
  { model: Admin, name: 'admins' },
  { model: Staff, name: 'staff' },
  // Auth (references roles/permissions)
  { model: User, name: 'users' },
  { model: Permission, name: 'permissions' },
  { model: Role, name: 'roles' },
  // Settings (one per tenant)
  { model: Settings, name: 'settings' },
];

interface DeletionStats {
  collection: string;
  deletedCount: number;
}

async function getTenantByIdOrSubdomain(identifier: string): Promise<InstanceType<typeof Tenant> | null> {
  await connectDB();
  
  // Try to find by ObjectId first
  if (Types.ObjectId.isValid(identifier)) {
    const tenant = await Tenant.findById(identifier);
    if (tenant) return tenant;
  }
  
  // Try to find by subdomain
  const tenant = await Tenant.findOne({ subdomain: identifier.toLowerCase().trim() });
  return tenant;
}

async function getTenantStats(tenantId: Types.ObjectId): Promise<{ [key: string]: number }> {
  const stats: { [key: string]: number } = {};
  
  for (const collection of TENANT_SCOPED_COLLECTIONS) {
    try {
      const count = await collection.model.countDocuments({ tenantId });
      if (count > 0) {
        stats[collection.name] = count;
      }
    } catch (error) {
      // Collection might not exist yet or model not registered
      stats[collection.name] = 0;
    }
  }
  
  return stats;
}

/**
 * Delete all documents that reference the tenant via tenantId field
 * This function deletes all documents across all collections where tenantId matches
 */
async function deleteTenantData(tenantId: Types.ObjectId): Promise<DeletionStats[]> {
  const results: DeletionStats[] = [];
  
  log('Deleting all data referencing this tenant...', 'info');
  log(`Searching for documents with tenantId: ${tenantId}`, 'info');
  
  for (const collection of TENANT_SCOPED_COLLECTIONS) {
    try {
      // Delete all documents where tenantId field matches the tenant being deleted
      // This catches all references to the tenant across all collections
      const result = await collection.model.deleteMany({ tenantId });
      if (result.deletedCount > 0) {
        results.push({
          collection: collection.name,
          deletedCount: result.deletedCount,
        });
        log(`  ✓ Deleted ${result.deletedCount} documents from ${collection.name}`, 'success');
      }
    } catch (error: any) {
      log(`  ✗ Error deleting ${collection.name}: ${error.message}`, 'error');
      results.push({
        collection: collection.name,
        deletedCount: 0,
      });
    }
  }
  
  return results;
}

/**
 * Verify that all tenant references have been deleted
 * This checks all collections to ensure no documents still reference the tenant
 */
async function verifyTenantDeletion(tenantId: Types.ObjectId): Promise<{ [key: string]: number }> {
  const remaining: { [key: string]: number } = {};
  
  for (const collection of TENANT_SCOPED_COLLECTIONS) {
    try {
      const count = await collection.model.countDocuments({ tenantId });
      if (count > 0) {
        remaining[collection.name] = count;
      }
    } catch (error) {
      // Collection might not exist or model not registered - ignore
    }
  }
  
  return remaining;
}

async function deleteTenant(tenantId: Types.ObjectId): Promise<boolean> {
  try {
    const result = await Tenant.deleteOne({ _id: tenantId });
    return result.deletedCount > 0;
  } catch (error: any) {
    log(`Error deleting tenant: ${error.message}`, 'error');
    return false;
  }
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  Delete Tenant Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Connect to database
    log('Connecting to database...', 'info');
    await connectDB();
    registerAllModels();

    if (mongoose.connection.readyState !== 1) {
      log('Database not connected', 'error');
      rl.close();
      process.exit(1);
      return;
    }

    // Get tenant identifier
    const identifier = await question('Enter Tenant ID or Subdomain: ');
    if (!identifier || !identifier.trim()) {
      log('Tenant identifier is required', 'error');
      rl.close();
      process.exit(1);
      return;
    }

    // Find tenant
    log('Finding tenant...', 'info');
    const tenant = await getTenantByIdOrSubdomain(identifier.trim());
    
    if (!tenant) {
      log(`Tenant not found: ${identifier}`, 'error');
      log('Please check the tenant ID or subdomain and try again.', 'info');
      rl.close();
      process.exit(1);
      return;
    }

    // Display tenant information
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Tenant Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ID: ${tenant._id}`);
    console.log(`  Name: ${tenant.name}`);
    console.log(`  Subdomain: ${tenant.subdomain}`);
    console.log(`  Status: ${tenant.status}`);
    console.log(`  Created: ${tenant.createdAt}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Get statistics
    log('Analyzing tenant data...', 'info');
    const stats = await getTenantStats(tenant._id);
    
    if (Object.keys(stats).length === 0) {
      log('No data found for this tenant', 'info');
    } else {
      console.log('Data Summary:');
      Object.entries(stats).forEach(([collection, count]) => {
        console.log(`  ${collection.padEnd(30)} ${count.toLocaleString().padStart(10)} documents`);
      });
      const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
      console.log(`  ${'Total'.padEnd(30)} ${total.toLocaleString().padStart(10)} documents\n`);
    }

    // Confirmation
    log('⚠️  WARNING: This will permanently delete the tenant and ALL associated data!', 'warning');
    log('This action CANNOT be undone!', 'warning');
    const confirm1 = await question('\nType "DELETE" to confirm: ');
    if (confirm1 !== 'DELETE') {
      log('Deletion cancelled', 'info');
      rl.close();
      await mongoose.connection.close();
      process.exit(0);
      return;
    }

    const confirm2 = await question('Are you absolutely sure? (yes/no): ');
    if (confirm2.toLowerCase() !== 'yes') {
      log('Deletion cancelled', 'info');
      rl.close();
      await mongoose.connection.close();
      process.exit(0);
      return;
    }

    // Delete tenant data
    log('\nStarting deletion process...', 'info');
    log('This will delete ALL documents that have a tenantId reference to this tenant', 'info');
    const deletionResults = await deleteTenantData(tenant._id);
    
    const totalDeleted = deletionResults.reduce((sum, r) => sum + r.deletedCount, 0);
    
    // Verify deletion
    log('\nVerifying all tenant references have been removed...', 'info');
    const remaining = await verifyTenantDeletion(tenant._id);
    
    if (Object.keys(remaining).length > 0) {
      log('Warning: Some documents still reference this tenant:', 'warning');
      Object.entries(remaining).forEach(([collection, count]) => {
        log(`  ${collection}: ${count} documents still exist`, 'warning');
      });
      const proceed = await question('\nContinue with tenant deletion anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        log('Deletion cancelled', 'info');
        rl.close();
        await mongoose.connection.close();
        process.exit(0);
        return;
      }
    } else {
      log('✓ All tenant references verified as deleted', 'success');
    }
    
    // Delete tenant itself
    log('\nDeleting tenant record...', 'info');
    const tenantDeleted = await deleteTenant(tenant._id);
    
    if (!tenantDeleted) {
      log('Warning: Tenant record may not have been deleted', 'warning');
    } else {
      log('✓ Tenant record deleted', 'success');
    }

    // Summary
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Deletion Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('Deletion Summary:');
    deletionResults
      .filter(r => r.deletedCount > 0)
      .forEach(({ collection, deletedCount }) => {
        console.log(`  ${collection.padEnd(30)} ${deletedCount.toLocaleString().padStart(10)} documents`);
      });
    
    console.log(`\n  ${'Total Documents Deleted'.padEnd(30)} ${totalDeleted.toLocaleString().padStart(10)}`);
    console.log(`  ${'Tenant Deleted'.padEnd(30)} ${tenantDeleted ? 'Yes' : 'No'}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    log('Tenant deletion completed successfully', 'success');
    
    rl.close();
    await mongoose.connection.close();
    process.exit(0);
  } catch (error: any) {
    log(`Error: ${error.message}`, 'error');
    console.error(error);
    rl.close();
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore close errors
    }
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Script failed:', error);
  rl.close();
  process.exit(1);
});

