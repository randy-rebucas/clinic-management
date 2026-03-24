/**
 * validate.ts — Post-migration validation
 *
 * Counts documents in all migrated collections and prints a summary.
 * Run after all migration scripts to confirm data was imported correctly.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/migrate/validate.ts
 */

import {
  connectDB,
  disconnectDB,
} from './utils';
import mongoose from 'mongoose';

// Import all models to register them
import Patient from '../../models/Patient';
import Doctor from '../../models/Doctor';
import Appointment from '../../models/Appointment';
import Invoice from '../../models/Invoice';
import Medicine from '../../models/Medicine';
import Inventory from '../../models/Inventory';
import Staff from '../../models/Staff';
import Admin from '../../models/Admin';
import Receptionist from '../../models/Receptionist';
import Nurse from '../../models/Nurse';
import Accountant from '../../models/Accountant';
import Prescription from '../../models/Prescription';
import LabResult from '../../models/LabResult';
import Specialization from '../../models/Specialization';

const COLLECTIONS = [
  { label: 'Specializations', model: Specialization },
  { label: 'Doctors', model: Doctor },
  { label: 'Patients', model: Patient },
  { label: 'Appointments', model: Appointment },
  { label: 'Invoices', model: Invoice },
  { label: 'Medicines', model: Medicine },
  { label: 'Inventory Items', model: Inventory },
  { label: 'Staff (generic)', model: Staff },
  { label: 'Admins', model: Admin },
  { label: 'Receptionists', model: Receptionist },
  { label: 'Nurses', model: Nurse },
  { label: 'Accountants', model: Accountant },
  { label: 'Prescriptions', model: Prescription },
  { label: 'Lab Results', model: LabResult },
];

async function main() {
  await connectDB();

  console.log('\n═══════════════════════════════════════════');
  console.log('  MyClinicSoft — Migration Validation');
  console.log('═══════════════════════════════════════════\n');
  console.log(`${'Collection'.padEnd(25)} ${'Count'.padStart(8)}`);
  console.log('─'.repeat(35));

  let total = 0;
  for (const { label, model } of COLLECTIONS) {
    try {
      const count = await (model as any).countDocuments();
      console.log(`${label.padEnd(25)} ${String(count).padStart(8)}`);
      total += count;
    } catch (e: any) {
      console.log(`${label.padEnd(25)} ${'ERROR'.padStart(8)}  (${e.message})`);
    }
  }

  console.log('─'.repeat(35));
  console.log(`${'TOTAL'.padEnd(25)} ${String(total).padStart(8)}`);
  console.log('\n═══════════════════════════════════════════\n');

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
