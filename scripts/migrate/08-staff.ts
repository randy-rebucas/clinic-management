/**
 * Step 08 — Migrate Staff / Users
 *
 * Expected CSV location: exports/staff.csv
 *
 * Minimum expected MySQL columns:
 *   id, first_name, last_name, email, phone, role,
 *   position, department, status, created_at
 *
 * NOTE: Passwords are NOT migrated — each staff member must reset their
 *       password on first login. A temporary random password is assigned.
 *
 * Roles mapped:
 *   MySQL role  → MongoDB model
 *   'doctor'    → Doctor (skip — use 02-doctors.ts)
 *   'admin'     → Admin
 *   'receptionist' → Receptionist
 *   'nurse'     → Nurse
 *   'accountant'→ Accountant
 *   *           → Staff (generic)
 */

import bcrypt from 'bcryptjs';
import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  str,
  toDate,
  logSummary,
} from './utils';
import Staff from '../../models/Staff';
import Admin from '../../models/Admin';
import Receptionist from '../../models/Receptionist';
import Nurse from '../../models/Nurse';
import Accountant from '../../models/Accountant';

const CSV_PATH = 'exports/staff.csv';

// Temporary password — users must change on first login
const TEMP_PASSWORD_HASH = bcrypt.hashSync('ChangeMe123!', 10);

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  console.log(`\n🔄  Migrating ${rows.length} staff members…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const firstName = str(row.first_name);
    const lastName = str(row.last_name);
    const email = str(row.email);
    if (!firstName || !lastName || !email) { skipped++; continue; }

    const role = (row.role ?? '').toLowerCase();

    // Skip doctors — migrated by 02-doctors.ts
    if (role === 'doctor') { skipped++; continue; }

    const base = {
      firstName,
      lastName,
      email,
      phone: str(row.phone) ?? '',
      password: TEMP_PASSWORD_HASH,
      status: (['active', 'inactive'].includes(row.status ?? '') ? row.status : 'active'),
      createdAt: toDate(row.created_at) ?? new Date(),
    };

    try {
      let doc: any;

      if (role === 'admin') {
        doc = await Admin.findOneAndUpdate(
          { email },
          { $setOnInsert: base },
          { upsert: true, new: true }
        );
      } else if (role === 'receptionist') {
        doc = await Receptionist.findOneAndUpdate(
          { email },
          { $setOnInsert: base },
          { upsert: true, new: true }
        );
      } else if (role === 'nurse') {
        doc = await Nurse.findOneAndUpdate(
          { email },
          { $setOnInsert: base },
          { upsert: true, new: true }
        );
      } else if (role === 'accountant') {
        doc = await Accountant.findOneAndUpdate(
          { email },
          { $setOnInsert: base },
          { upsert: true, new: true }
        );
      } else {
        // Generic staff
        doc = await Staff.findOneAndUpdate(
          { email },
          {
            $setOnInsert: {
              ...base,
              role: str(row.role) ?? 'staff',
              position: str(row.position),
              department: str(row.department),
            },
          },
          { upsert: true, new: true }
        );
      }

      idMap[row.id] = doc._id.toString();
      process.stdout.write('.');
    } catch (err: any) {
      console.error(`\n  ❌  Row id=${row.id} (${email}): ${err.message}`);
      skipped++;
    }
  }

  saveIdMap('staff', idMap);
  logSummary('Staff', rows.length, skipped);

  console.log('\n⚠️   All migrated users have the temporary password: ChangeMe123!');
  console.log('    Remind each user to reset their password on first login.\n');

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
