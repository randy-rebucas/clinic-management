/**
 * Step 06 — Migrate Medicines
 *
 * Expected CSV location: exports/medicines.csv
 *
 * Minimum expected MySQL columns:
 *   id, name, generic_name, brand, dosage_form, strength,
 *   unit, category, description, requires_prescription, status
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  str,
  toBool,
  logSummary,
} from './utils';
import Medicine from '../../models/Medicine';

const CSV_PATH = 'exports/medicines.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  console.log(`\n🔄  Migrating ${rows.length} medicines…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const name = str(row.name);
    if (!name) { skipped++; continue; }

    try {
      const doc = await Medicine.findOneAndUpdate(
        { name },
        {
          $setOnInsert: {
            name,
            genericName: str(row.generic_name),
            brand: str(row.brand),
            dosageForm: str(row.dosage_form),
            strength: str(row.strength),
            unit: str(row.unit),
            category: str(row.category),
            description: str(row.description),
            requiresPrescription: toBool(row.requires_prescription),
            status: (['active', 'inactive'].includes(row.status ?? '') ? row.status : 'active'),
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

  saveIdMap('medicines', idMap);
  logSummary('Medicines', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
