/**
 * Step 07 — Migrate Inventory
 *
 * Expected CSV location: exports/inventory.csv
 *
 * Minimum expected MySQL columns:
 *   id, name, sku, category, description, quantity, unit,
 *   reorder_level, unit_cost, unit_price, supplier, expiry_date, status
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  str,
  num,
  toDate,
  logSummary,
} from './utils';
import Inventory from '../../models/Inventory';

const CSV_PATH = 'exports/inventory.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  console.log(`\n🔄  Migrating ${rows.length} inventory items…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const name = str(row.name);
    if (!name) { skipped++; continue; }

    try {
      const doc = await Inventory.findOneAndUpdate(
        { name, sku: str(row.sku) },
        {
          $setOnInsert: {
            name,
            sku: str(row.sku),
            category: str(row.category),
            description: str(row.description),
            quantity: num(row.quantity) ?? 0,
            unit: str(row.unit) ?? 'pcs',
            reorderLevel: num(row.reorder_level) ?? 0,
            unitCost: num(row.unit_cost),
            unitPrice: num(row.unit_price),
            supplier: str(row.supplier),
            expiryDate: toDate(row.expiry_date),
            status: (['active', 'inactive', 'discontinued'].includes(row.status ?? '')
              ? row.status
              : 'active'),
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

  saveIdMap('inventory', idMap);
  logSummary('Inventory', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
