/**
 * Step 01 — Migrate Specializations
 *
 * Expected CSV location: exports/specializations.csv
 *
 * Minimum expected MySQL columns:
 *   id, name, description
 */

import { connectDB, disconnectDB, readCSV, saveIdMap, str, logSummary } from './utils';
import Specialization from '../../models/Specialization';

const CSV_PATH = 'exports/specializations.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  console.log(`\n🔄  Migrating ${rows.length} specializations…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const name = str(row.name);
    if (!name) { skipped++; continue; }

    try {
      // Upsert — safe to re-run
      const doc = await Specialization.findOneAndUpdate(
        { name },
        {
          $setOnInsert: {
            name,
            description: str(row.description),
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

  saveIdMap('specializations', idMap);
  logSummary('Specializations', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
