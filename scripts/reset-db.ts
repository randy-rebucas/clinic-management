import { config } from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import readline from 'readline';
import connectDB from '../lib/mongodb';
import { registerAllModels } from '../models';
import {
  AuditLog,
  Notification,
  Queue,
  Membership,
  Referral,
  Document,
  Invoice,
  Procedure,
  Imaging,
  LabResult,
  Prescription,
  Visit,
  Appointment,
  InventoryItem,
  Medicine,
  Service,
  Room,
  Specialization,
  Patient,
  MedicalRepresentative,
  Accountant,
  Receptionist,
  Nurse,
  Doctor,
  Admin,
  Staff,
  User,
  Permission,
  Role,
  Settings,
  Tenant,
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

// Collection groups for selective cleaning
const COLLECTION_GROUPS = {
  audit: {
    name: 'Audit & Notifications',
    collections: [
      { model: AuditLog, name: 'auditlogs' },
      { model: Notification, name: 'notifications' },
    ],
  },
  clinical: {
    name: 'Clinical Records',
    collections: [
      { model: Visit, name: 'visits' },
      { model: Appointment, name: 'appointments' },
      { model: Prescription, name: 'prescriptions' },
      { model: LabResult, name: 'labresults' },
      { model: Imaging, name: 'imaging' },
      { model: Procedure, name: 'procedures' },
      { model: Referral, name: 'referrals' },
    ],
  },
  billing: {
    name: 'Billing & Financial',
    collections: [
      { model: Invoice, name: 'invoices' },
      { model: Membership, name: 'memberships' },
    ],
  },
  patients: {
    name: 'Patients',
    collections: [
      { model: Patient, name: 'patients' },
    ],
  },
  users: {
    name: 'Users & Staff',
    collections: [
      { model: Admin, name: 'admins' },
      { model: Doctor, name: 'doctors' },
      { model: Nurse, name: 'nurses' },
      { model: Receptionist, name: 'receptionists' },
      { model: Accountant, name: 'accountants' },
      { model: MedicalRepresentative, name: 'medicalrepresentatives' },
      { model: Staff, name: 'staff' },
      { model: User, name: 'users' },
      { model: Permission, name: 'permissions' },
      { model: Role, name: 'roles' },
    ],
  },
  inventory: {
    name: 'Inventory & Catalog',
    collections: [
      { model: InventoryItem, name: 'inventoryitems' },
      { model: Medicine, name: 'medicines' },
      { model: Service, name: 'services' },
      { model: Room, name: 'rooms' },
      { model: Specialization, name: 'specializations' },
    ],
  },
  documents: {
    name: 'Documents',
    collections: [
      { model: Document, name: 'documents' },
    ],
  },
  queue: {
    name: 'Queue Management',
    collections: [
      { model: Queue, name: 'queues' },
    ],
  },
  settings: {
    name: 'Settings',
    collections: [
      { model: Settings, name: 'settings' },
    ],
  },
  tenants: {
    name: 'Tenants',
    collections: [
      { model: Tenant, name: 'tenants' },
    ],
  },
};

// All collections in deletion order (dependencies first)
const ALL_COLLECTIONS = [
  // Audit & Notifications
  { model: AuditLog, name: 'auditlogs' },
  { model: Notification, name: 'notifications' },
  // Queue & Membership
  { model: Queue, name: 'queues' },
  { model: Membership, name: 'memberships' },
  // Documents & Referrals
  { model: Referral, name: 'referrals' },
  { model: Document, name: 'documents' },
  // Billing
  { model: Invoice, name: 'invoices' },
  // Clinical records
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
  // Patient
  { model: Patient, name: 'patients' },
  // Profile models
  { model: MedicalRepresentative, name: 'medicalrepresentatives' },
  { model: Accountant, name: 'accountants' },
  { model: Receptionist, name: 'receptionists' },
  { model: Nurse, name: 'nurses' },
  { model: Doctor, name: 'doctors' },
  { model: Admin, name: 'admins' },
  { model: Staff, name: 'staff' },
  // Auth
  { model: User, name: 'users' },
  { model: Permission, name: 'permissions' },
  { model: Role, name: 'roles' },
  // Settings
  { model: Settings, name: 'settings' },
  // Tenant (last)
  { model: Tenant, name: 'tenants' },
];

interface CollectionStats {
  name: string;
  count: number;
}

async function getCollectionStats(): Promise<CollectionStats[]> {
  const stats: CollectionStats[] = [];
  
  for (const collection of ALL_COLLECTIONS) {
    try {
      const count = await collection.model.countDocuments({});
      if (count > 0) {
        stats.push({ name: collection.name, count });
      }
    } catch (error) {
      // Collection might not exist yet
    }
  }
  
  return stats.sort((a, b) => b.count - a.count);
}

async function deleteCollections(collections: typeof ALL_COLLECTIONS): Promise<{ [key: string]: number }> {
  const deletionResults: { [key: string]: number } = {};
  
  const deletions = collections.map(({ model, name }) =>
    model.deleteMany({}).then(result => {
      deletionResults[name] = result.deletedCount;
      return result;
    })
  );
  
  await Promise.all(deletions);
  return deletionResults;
}

async function resetAllCollections(): Promise<boolean> {
  try {
    log('Connecting to database...', 'info');
    await connectDB();
    registerAllModels();

    if (mongoose.connection.readyState !== 1) {
      log('Database not connected', 'error');
      return false;
    }

    // Show current stats
    log('\nCurrent database statistics:', 'info');
    const stats = await getCollectionStats();
    if (stats.length === 0) {
      log('Database is already empty', 'info');
      await mongoose.connection.close();
      return true;
    }

    console.log('\nCollection Counts:');
    stats.forEach(({ name, count }) => {
      console.log(`  ${name}: ${count} documents`);
    });
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    console.log(`\nTotal: ${total} documents across ${stats.length} collections\n`);

    // Confirmation
    log('⚠️  WARNING: This will delete ALL data from the database!', 'warning');
    const confirm1 = await question('Type "RESET" to confirm: ');
    if (confirm1 !== 'RESET') {
      log('Reset cancelled', 'info');
      await mongoose.connection.close();
      return false;
    }

    const confirm2 = await question('Are you absolutely sure? This cannot be undone! (yes/no): ');
    if (confirm2.toLowerCase() !== 'yes') {
      log('Reset cancelled', 'info');
      await mongoose.connection.close();
      return false;
    }

    log('Deleting all collections (this may take a moment)...', 'info');
    const deletionResults = await deleteCollections(ALL_COLLECTIONS);
    
    const totalDeleted = Object.values(deletionResults).reduce((sum, count) => sum + count, 0);
    
    log('Database reset complete', 'success');
    log(`Total documents deleted: ${totalDeleted}`, 'info');
    
    console.log('\nDeletion Summary:');
    Object.entries(deletionResults)
      .filter(([_, count]) => count > 0)
      .forEach(([collection, count]) => {
        console.log(`  ${collection}: ${count} documents`);
      });

    await mongoose.connection.close();
    return true;
  } catch (error: any) {
    log(`Error resetting database: ${error.message}`, 'error');
    console.error(error);
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore close errors
    }
    return false;
  }
}

async function cleanSelectiveCollections(): Promise<boolean> {
  try {
    log('Connecting to database...', 'info');
    await connectDB();
    registerAllModels();

    if (mongoose.connection.readyState !== 1) {
      log('Database not connected', 'error');
      return false;
    }

    // Show current stats
    log('\nCurrent database statistics:', 'info');
    const stats = await getCollectionStats();
    if (stats.length === 0) {
      log('Database is already empty', 'info');
      await mongoose.connection.close();
      return true;
    }

    console.log('\nCollection Counts:');
    stats.forEach(({ name, count }) => {
      console.log(`  ${name}: ${count} documents`);
    });

    // Show collection groups
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Available Collection Groups:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const groupEntries = Object.entries(COLLECTION_GROUPS);
    groupEntries.forEach(([key, group], index) => {
      console.log(`${index + 1}. ${group.name} (${group.collections.length} collections)`);
      group.collections.forEach(col => {
        const stat = stats.find(s => s.name === col.name);
        const count = stat ? stat.count : 0;
        console.log(`   - ${col.name}: ${count} documents`);
      });
      console.log();
    });

    console.log(`${groupEntries.length + 1}. Custom selection (choose specific collections)`);
    console.log(`${groupEntries.length + 2}. All collections\n`);

    const choice = await question('Select option (1-' + (groupEntries.length + 2) + '): ');
    const choiceNum = parseInt(choice);

    let collectionsToDelete: typeof ALL_COLLECTIONS = [];

    if (choiceNum >= 1 && choiceNum <= groupEntries.length) {
      // Selected a group
      const selectedGroup = groupEntries[choiceNum - 1][1];
      collectionsToDelete = selectedGroup.collections.map(col => {
        const fullCol = ALL_COLLECTIONS.find(c => c.name === col.name);
        if (!fullCol) throw new Error(`Collection ${col.name} not found`);
        return fullCol;
      });
      
      log(`\nSelected group: ${selectedGroup.name}`, 'info');
      log(`This will delete ${selectedGroup.collections.length} collections`, 'warning');
    } else if (choiceNum === groupEntries.length + 1) {
      // Custom selection
      console.log('\nAvailable collections:');
      ALL_COLLECTIONS.forEach((col, index) => {
        const stat = stats.find(s => s.name === col.name);
        const count = stat ? stat.count : 0;
        console.log(`${index + 1}. ${col.name} (${count} documents)`);
      });
      
      const selections = await question('\nEnter collection numbers (comma-separated, e.g., 1,3,5): ');
      const indices = selections.split(',').map(s => parseInt(s.trim()) - 1);
      
      collectionsToDelete = indices
        .filter(idx => idx >= 0 && idx < ALL_COLLECTIONS.length)
        .map(idx => ALL_COLLECTIONS[idx]);
      
      if (collectionsToDelete.length === 0) {
        log('No valid collections selected', 'error');
        await mongoose.connection.close();
        return false;
      }
    } else if (choiceNum === groupEntries.length + 2) {
      // All collections
      collectionsToDelete = ALL_COLLECTIONS;
    } else {
      log('Invalid selection', 'error');
      await mongoose.connection.close();
      return false;
    }

    // Show what will be deleted
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Collections to be deleted:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    collectionsToDelete.forEach(col => {
      const stat = stats.find(s => s.name === col.name);
      const count = stat ? stat.count : 0;
      console.log(`  ${col.name}: ${count} documents`);
    });
    const totalToDelete = collectionsToDelete.reduce((sum, col) => {
      const stat = stats.find(s => s.name === col.name);
      return sum + (stat ? stat.count : 0);
    }, 0);
    console.log(`\nTotal: ${totalToDelete} documents\n`);

    // Confirmation
    log('⚠️  WARNING: This will delete the selected collections!', 'warning');
    const confirm = await question('Type "DELETE" to confirm: ');
    if (confirm !== 'DELETE') {
      log('Deletion cancelled', 'info');
      await mongoose.connection.close();
      return false;
    }

    log('Deleting selected collections...', 'info');
    const deletionResults = await deleteCollections(collectionsToDelete);
    
    const totalDeleted = Object.values(deletionResults).reduce((sum, count) => sum + count, 0);
    
    log('Deletion complete', 'success');
    log(`Total documents deleted: ${totalDeleted}`, 'info');
    
    console.log('\nDeletion Summary:');
    Object.entries(deletionResults)
      .filter(([_, count]) => count > 0)
      .forEach(([collection, count]) => {
        console.log(`  ${collection}: ${count} documents`);
      });

    await mongoose.connection.close();
    return true;
  } catch (error: any) {
    log(`Error cleaning collections: ${error.message}`, 'error');
    console.error(error);
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore close errors
    }
    return false;
  }
}

async function showStats(): Promise<void> {
  try {
    log('Connecting to database...', 'info');
    await connectDB();
    registerAllModels();

    if (mongoose.connection.readyState !== 1) {
      log('Database not connected', 'error');
      return;
    }

    const stats = await getCollectionStats();
    
    if (stats.length === 0) {
      log('Database is empty', 'info');
      await mongoose.connection.close();
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Database Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Group by category
    const grouped: { [key: string]: CollectionStats[] } = {};
    
    Object.entries(COLLECTION_GROUPS).forEach(([key, group]) => {
      group.collections.forEach(col => {
        const stat = stats.find(s => s.name === col.name);
        if (stat) {
          if (!grouped[group.name]) {
            grouped[group.name] = [];
          }
          grouped[group.name].push(stat);
        }
      });
    });

    // Add ungrouped collections
    const groupedNames = new Set(
      Object.values(COLLECTION_GROUPS).flatMap(g => g.collections.map(c => c.name))
    );
    const ungrouped = stats.filter(s => !groupedNames.has(s.name));
    if (ungrouped.length > 0) {
      grouped['Other'] = ungrouped;
    }

    Object.entries(grouped).forEach(([category, categoryStats]) => {
      console.log(`\n${category}:`);
      categoryStats.forEach(({ name, count }) => {
        console.log(`  ${name.padEnd(30)} ${count.toLocaleString().padStart(10)} documents`);
      });
      const categoryTotal = categoryStats.reduce((sum, s) => sum + s.count, 0);
      console.log(`  ${'Total'.padEnd(30)} ${categoryTotal.toLocaleString().padStart(10)} documents`);
    });

    const total = stats.reduce((sum, s) => sum + s.count, 0);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Grand Total: ${total.toLocaleString()} documents across ${stats.length} collections`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connection.close();
  } catch (error: any) {
    log(`Error getting statistics: ${error.message}`, 'error');
    console.error(error);
    try {
      await mongoose.connection.close();
    } catch (closeError) {
      // Ignore close errors
    }
  }
}

async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗑️  Database Reset & Clean Script');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--stats') || args.includes('-s')) {
    await showStats();
    rl.close();
    process.exit(0);
    return;
  }

  if (args.includes('--all') || args.includes('-a')) {
    const success = await resetAllCollections();
    rl.close();
    process.exit(success ? 0 : 1);
    return;
  }

  if (args.includes('--selective') || args.includes('-sel')) {
    const success = await cleanSelectiveCollections();
    rl.close();
    process.exit(success ? 0 : 1);
    return;
  }

  // Interactive mode
  console.log('Select an option:');
  console.log('  1. Show database statistics');
  console.log('  2. Reset all collections (delete everything)');
  console.log('  3. Clean selective collections');
  console.log('  4. Exit\n');

  const choice = await question('Enter option (1-4): ');

  switch (choice) {
    case '1':
      await showStats();
      break;
    case '2':
      await resetAllCollections();
      break;
    case '3':
      await cleanSelectiveCollections();
      break;
    case '4':
      log('Exiting...', 'info');
      break;
    default:
      log('Invalid option', 'error');
  }

  rl.close();
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error('\n❌ Script failed:', error);
  rl.close();
  process.exit(1);
});

