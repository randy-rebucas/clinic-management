/**
 * Step 02 — Migrate Doctors
 *
 * Expected CSV location: exports/doctors.csv
 *
 * Minimum expected MySQL columns:
 *   id, first_name, last_name, email, phone, license_number,
 *   specialization_id, status, title, bio, department
 *
 * Depends on: 01-specializations (id-map must exist)
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  loadIdMap,
  str,
  toBool,
  logSummary,
  resolve,
} from './utils';
import Doctor from '../../models/Doctor';

const CSV_PATH = 'exports/doctors.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  const specMap = loadIdMap('specializations');

  console.log(`\n🔄  Migrating ${rows.length} doctors…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const firstName = str(row.first_name);
    const lastName = str(row.last_name);
    const email = str(row.email);
    if (!firstName || !lastName || !email) { skipped++; continue; }

    const specializationId = resolve(specMap, row.specialization_id);

    try {
      const doc = await Doctor.findOneAndUpdate(
        { email },
        {
          $setOnInsert: {
            firstName,
            lastName,
            email,
            phone: str(row.phone) ?? '',
            licenseNumber: str(row.license_number) ?? '',
            specializationId: specializationId ?? undefined,
            title: str(row.title),
            bio: str(row.bio),
            department: str(row.department),
            status: (['active', 'inactive', 'on-leave'].includes(row.status)
              ? row.status
              : 'active') as 'active' | 'inactive' | 'on-leave',
            // Default empty schedule — update manually or via app
            schedule: [],
          },
        },
        { upsert: true, new: true }
      );
      idMap[row.id] = doc._id.toString();
      process.stdout.write('.');
    } catch (err: any) {
      console.error(`\n  ❌  Row id=${row.id}: ${err.message}`);
      skipped++;
    }
  }

  saveIdMap('doctors', idMap);
  logSummary('Doctors', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
