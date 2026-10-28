import { config } from 'dotenv';
import { resolve, join } from 'path';
import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import mongoose, { Model, Types } from 'mongoose';
import readline from 'readline';

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
 * Which collections hold a clinic's data is read from the schemas, not kept by hand: every model
 * with a top-level `tenantId` is the clinic's and is deleted, except the ones named below. A model
 * that points at Tenant any other way stops the script until it is classified here.
 */

/** Platform billing: sales invoices and the orders behind them are kept for BIR record retention. */
const RETAINED = new Set(['PlatformInvoice', 'SubscriptionOrder']);

/** Shared between clinics through `tenantIds`: the clinic is removed, and a record no other clinic uses is deleted. */
const SHARED = new Set(['Patient', 'MedicalRepresentative']);

/** `tenantIds` here is an audience, not ownership (an empty list means every clinic), so it is left alone. */
const IGNORED = new Set(['PlatformAnnouncement']);

interface DeletionStats {
  collection: string;
  deletedCount: number;
  detachedCount?: number;
}

interface Plan {
  owned: Model<any>[];
  shared: Model<any>[];
}

async function loadAllModels(): Promise<void> {
  const dir = resolve(__dirname, '../models');
  for (const file of readdirSync(dir)) {
    if (!/\.ts$/.test(file) || file === 'index.ts' || file.endsWith('.d.ts')) continue;
    await import(pathToFileURL(join(dir, file)).href);
  }
}

/** A path, or an array path's items, referencing Tenant. */
function refersToTenant(schemaType: any): boolean {
  return schemaType?.options?.ref === 'Tenant' || schemaType?.caster?.options?.ref === 'Tenant';
}

/** Sort every registered model into owned / shared, or explain why it can't be. */
function planDeletion(): Plan {
  const owned: Model<any>[] = [];
  const shared: Model<any>[] = [];
  const unclassified: string[] = [];

  for (const name of mongoose.modelNames().sort()) {
    if (name === 'Tenant' || RETAINED.has(name) || IGNORED.has(name)) continue;
    const model = mongoose.model(name);
    if (SHARED.has(name)) {
      shared.push(model);
      continue;
    }
    if (model.schema.path('tenantId')) {
      owned.push(model);
      continue;
    }
    // Any other top-level path pointing at Tenant (e.g. a new `tenantIds` list) needs a decision.
    const other = Object.entries(model.schema.paths)
      .filter(([path, schemaType]) => !path.includes('.') && refersToTenant(schemaType))
      .map(([path]) => path);
    if (other.length) unclassified.push(`${name}.${other.join(', ')}`);
  }

  if (unclassified.length) {
    throw new Error(
      `These models point at Tenant in a way this script does not know how to delete: ${unclassified.join('; ')}. ` +
        'Add them to RETAINED, SHARED or IGNORED in scripts/delete-tenant.ts first.'
    );
  }
  return { owned, shared };
}

async function getTenantByIdOrSubdomain(identifier: string) {
  const Tenant = mongoose.model('Tenant');
  // Try to find by ObjectId first
  if (Types.ObjectId.isValid(identifier)) {
    const tenant = await Tenant.findById(identifier);
    if (tenant) return tenant;
  }

  // Try to find by subdomain
  return Tenant.findOne({ subdomain: identifier.toLowerCase().trim() });
}

async function getTenantStats(plan: Plan, tenantId: Types.ObjectId): Promise<Record<string, string>> {
  const stats: Record<string, string> = {};
  for (const model of plan.owned) {
    const count = await model.countDocuments({ tenantId });
    if (count > 0) stats[model.collection.name] = `${count.toLocaleString()} to delete`;
  }
  for (const model of plan.shared) {
    const [only, alsoOthers] = await Promise.all([
      model.countDocuments({ tenantIds: { $size: 1, $all: [tenantId] } }),
      model.countDocuments({ tenantIds: tenantId, 'tenantIds.1': { $exists: true } }),
    ]);
    if (only + alsoOthers > 0) {
      stats[model.collection.name] = `${only.toLocaleString()} to delete, ${alsoOthers.toLocaleString()} shared with other clinics to detach`;
    }
  }
  return stats;
}

/** Remove the clinic's uploaded documents from Cloudinary before their records go. */
async function deleteCloudinaryFiles(tenantId: Types.ObjectId): Promise<{ deleted: number; failed: string[] }> {
  // lib/document-file is server-only; its cloudinaryRefForDocument is this same call.
  const { cloudinaryRefFromStored, deleteFromCloudinary, isCloudinaryConfigured } = await import('../lib/cloudinary');
  const docs = await mongoose.model('Document').find({ tenantId }).select('url metadata').lean<{ _id: Types.ObjectId; url?: string; metadata?: any }[]>();
  let deleted = 0;
  const failed: string[] = [];
  for (const doc of docs) {
    const ref = cloudinaryRefFromStored(doc.url, doc.metadata);
    if (!ref) continue;
    const result = await deleteFromCloudinary(ref.publicId, { resourceType: ref.resourceType, deliveryType: ref.deliveryType });
    if (result.success) deleted++;
    else failed.push(`${ref.publicId}: ${result.error ?? 'failed'}`);
  }

  // Files attached to patients, visits and lab results live under one folder per clinic
  // (lib/attachment-file.ts), so they go by prefix.
  if (!isCloudinaryConfigured()) return { deleted, failed };
  const { v2: cloudinary } = await import('cloudinary');
  const prefix = `clinic-attachments/${String(tenantId)}/`;
  for (const resource_type of ['image', 'raw'] as const) {
    try {
      const res = await cloudinary.api.delete_resources_by_prefix(prefix, { resource_type, type: 'authenticated' });
      deleted += Object.values(res.deleted ?? {}).filter((v) => v === 'deleted').length;
    } catch (error: any) {
      failed.push(`${prefix} (${resource_type}): ${error?.message ?? 'failed'}`);
    }
  }
  return { deleted, failed };
}

/** Detach the clinic from shared records, deleting the ones that belonged to it alone. */
async function detachShared(model: Model<any>, tenantId: Types.ObjectId): Promise<DeletionStats> {
  const onlyThisClinic = { tenantIds: { $size: 1, $all: [tenantId] } };
  const { deletedCount } = await model.deleteMany(onlyThisClinic);

  if (model.modelName === 'Patient') {
    // Sign-in set up by this clinic is scoped to it; an unscoped password would open every clinic.
    await model.updateMany({ tenantIds: tenantId, passwordTenantId: tenantId }, { $unset: { password: '', passwordTenantId: '' } });
    await model.updateMany(
      { tenantIds: tenantId, loginQrTenantId: tenantId },
      { $unset: { loginQrTokenHash: '', loginQrTokenExpiry: '', loginQrTenantId: '' } }
    );
  }
  const pull: Record<string, unknown> = { tenantIds: tenantId };
  if (model.modelName === 'Patient') {
    pull.attachments = { tenantId };
    pull.guardians = { tenantId };
  }
  const { modifiedCount } = await model.updateMany({ tenantIds: tenantId }, { $pull: pull });

  return { collection: model.collection.name, deletedCount, detachedCount: modifiedCount };
}

/**
 * Delete everything the clinic owns and detach it from shared records.
 */
async function deleteTenantData(plan: Plan, tenantId: Types.ObjectId): Promise<DeletionStats[]> {
  const results: DeletionStats[] = [];

  log('Removing uploaded files from Cloudinary...', 'info');
  const files = await deleteCloudinaryFiles(tenantId);
  log(`  ✓ Deleted ${files.deleted} Cloudinary files`, 'success');
  for (const f of files.failed) log(`  ✗ Not deleted from Cloudinary: ${f}`, 'error');

  log('Deleting all data owned by this tenant...', 'info');
  for (const model of plan.owned) {
    try {
      const result = await model.deleteMany({ tenantId });
      results.push({ collection: model.collection.name, deletedCount: result.deletedCount });
      if (result.deletedCount > 0) {
        log(`  ✓ Deleted ${result.deletedCount} documents from ${model.collection.name}`, 'success');
      }
    } catch (error: any) {
      log(`  ✗ Error deleting ${model.collection.name}: ${error.message}`, 'error');
      results.push({ collection: model.collection.name, deletedCount: 0 });
    }
  }

  for (const model of plan.shared) {
    try {
      const stats = await detachShared(model, tenantId);
      results.push(stats);
      log(`  ✓ ${model.collection.name}: deleted ${stats.deletedCount}, detached ${stats.detachedCount}`, 'success');
    } catch (error: any) {
      log(`  ✗ Error detaching ${model.collection.name}: ${error.message}`, 'error');
      results.push({ collection: model.collection.name, deletedCount: 0 });
    }
  }

  return results;
}

/**
 * Verify that no owned or shared record still references the tenant.
 */
async function verifyTenantDeletion(plan: Plan, tenantId: Types.ObjectId): Promise<Record<string, number>> {
  const remaining: Record<string, number> = {};
  for (const model of plan.owned) {
    const count = await model.countDocuments({ tenantId });
    if (count > 0) remaining[model.collection.name] = count;
  }
  for (const model of plan.shared) {
    const count = await model.countDocuments({ tenantIds: tenantId });
    if (count > 0) remaining[model.collection.name] = count;
  }
  return remaining;
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  Delete Tenant Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');

    log('Connecting to database...', 'info');
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    await loadAllModels();
    const plan = planDeletion();

    log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`, 'warning');
    log(`Kept for record retention: ${[...RETAINED].join(', ')}`, 'info');

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
      await mongoose.disconnect();
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
    const stats = await getTenantStats(plan, tenant._id);

    if (Object.keys(stats).length === 0) {
      log('No data found for this tenant', 'info');
    } else {
      console.log('Data Summary:');
      Object.entries(stats).forEach(([collection, summary]) => {
        console.log(`  ${collection.padEnd(30)} ${summary}`);
      });
      console.log('');
    }

    // Confirmation
    log('⚠️  WARNING: This will permanently delete the tenant and ALL associated data!', 'warning');
    log('This action CANNOT be undone!', 'warning');
    const confirm1 = await question(`\nType the subdomain "${tenant.subdomain}" to confirm: `);
    if (confirm1.trim() !== tenant.subdomain) {
      log('Deletion cancelled', 'info');
      rl.close();
      await mongoose.disconnect();
      process.exit(0);
      return;
    }

    const confirm2 = await question('Are you absolutely sure? (yes/no): ');
    if (confirm2.toLowerCase() !== 'yes') {
      log('Deletion cancelled', 'info');
      rl.close();
      await mongoose.disconnect();
      process.exit(0);
      return;
    }

    // Delete tenant data
    log('\nStarting deletion process...', 'info');
    const deletionResults = await deleteTenantData(plan, tenant._id);

    const totalDeleted = deletionResults.reduce((sum, r) => sum + r.deletedCount, 0);
    const totalDetached = deletionResults.reduce((sum, r) => sum + (r.detachedCount ?? 0), 0);

    // Verify deletion
    log('\nVerifying all tenant references have been removed...', 'info');
    const remaining = await verifyTenantDeletion(plan, tenant._id);

    if (Object.keys(remaining).length > 0) {
      log('Warning: Some documents still reference this tenant:', 'warning');
      Object.entries(remaining).forEach(([collection, count]) => {
        log(`  ${collection}: ${count} documents still exist`, 'warning');
      });
      const proceed = await question('\nContinue with tenant deletion anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        log('Deletion cancelled', 'info');
        rl.close();
        await mongoose.disconnect();
        process.exit(0);
        return;
      }
    } else {
      log('✓ All tenant references verified as deleted', 'success');
    }

    // Delete tenant itself
    log('\nDeleting tenant record...', 'info');
    const tenantDeleted = (await mongoose.model('Tenant').deleteOne({ _id: tenant._id })).deletedCount > 0;

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
      .filter((r) => r.deletedCount > 0 || r.detachedCount)
      .forEach(({ collection, deletedCount, detachedCount }) => {
        const detached = detachedCount ? `  (${detachedCount.toLocaleString()} detached)` : '';
        console.log(`  ${collection.padEnd(30)} ${deletedCount.toLocaleString().padStart(10)} documents${detached}`);
      });

    console.log(`\n  ${'Total Documents Deleted'.padEnd(30)} ${totalDeleted.toLocaleString().padStart(10)}`);
    console.log(`  ${'Shared Records Detached'.padEnd(30)} ${totalDetached.toLocaleString().padStart(10)}`);
    console.log(`  ${'Tenant Deleted'.padEnd(30)} ${tenantDeleted ? 'Yes' : 'No'}`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    log('Tenant deletion completed successfully', 'success');

    rl.close();
    await mongoose.disconnect();
    process.exit(0);
  } catch (error: any) {
    log(`Error: ${error.message}`, 'error');
    console.error(error);
    rl.close();
    try {
      await mongoose.disconnect();
    } catch {
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
