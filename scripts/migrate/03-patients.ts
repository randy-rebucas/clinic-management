/**
 * Step 03 — Migrate Patients
 *
 * Expected CSV location: exports/patients.csv
 *
 * Minimum expected MySQL columns:
 *   id, first_name, middle_name, last_name, suffix, date_of_birth, sex,
 *   civil_status, nationality, occupation, email, phone,
 *   address_street, address_city, address_state, address_zip,
 *   emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
 *   philhealth, gov_id, medical_history, allergies, status
 *
 * No foreign keys required — run before Appointment/Invoice scripts.
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  str,
  toDate,
  logSummary,
} from './utils';
import Patient from '../../models/Patient';

const CSV_PATH = 'exports/patients.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  console.log(`\n🔄  Migrating ${rows.length} patients…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const firstName = str(row.first_name);
    const lastName = str(row.last_name);
    const phone = str(row.phone);

    if (!firstName || !lastName || !phone) {
      console.warn(`  ⚠️  Skipping row id=${row.id} — missing required fields`);
      skipped++;
      continue;
    }

    // Parse allergies: supports comma-separated string from MySQL
    const allergiesRaw = str(row.allergies);
    const allergies = allergiesRaw
      ? allergiesRaw.split(',').map((a) => a.trim()).filter(Boolean)
      : [];

    const sex = (['male', 'female', 'other'].includes((row.sex ?? '').toLowerCase())
      ? row.sex.toLowerCase()
      : 'other') as 'male' | 'female' | 'other';

    try {
      const doc = await Patient.findOneAndUpdate(
        // Deduplicate by phone + name
        { phone, firstName, lastName },
        {
          $setOnInsert: {
            firstName,
            middleName: str(row.middle_name),
            lastName,
            suffix: str(row.suffix),
            dateOfBirth: toDate(row.date_of_birth),
            sex,
            civilStatus: str(row.civil_status),
            nationality: str(row.nationality),
            occupation: str(row.occupation),
            email: str(row.email),
            phone,
            address: {
              street: str(row.address_street) ?? '',
              city: str(row.address_city) ?? '',
              state: str(row.address_state) ?? '',
              zipCode: str(row.address_zip) ?? '',
            },
            emergencyContact: {
              name: str(row.emergency_contact_name),
              phone: str(row.emergency_contact_phone),
              relationship: str(row.emergency_contact_relationship),
            },
            identifiers: {
              philHealth: str(row.philhealth),
              govId: str(row.gov_id),
            },
            medicalHistory: str(row.medical_history),
            allergies,
            // status field if your old system tracks active/inactive
            ...(str(row.status) ? { status: row.status } : {}),
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

  saveIdMap('patients', idMap);
  logSummary('Patients', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
