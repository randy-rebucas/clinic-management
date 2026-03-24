/**
 * Step 05 — Migrate Invoices
 *
 * Expected CSV location:
 *   exports/invoices.csv      — one row per invoice
 *   exports/invoice_items.csv — one row per line item (joined by invoice_id)
 *
 * Minimum expected MySQL columns (invoices.csv):
 *   id, patient_id, invoice_number, subtotal, tax, total,
 *   status, created_at, discount_type, discount_amount,
 *   payment_method, payment_amount, payment_date, receipt_no
 *
 * Minimum expected MySQL columns (invoice_items.csv):
 *   invoice_id, description, code, category, quantity, unit_price, total
 *
 * Depends on: 03-patients
 */

import path from 'path';
import fs from 'fs';
import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  loadIdMap,
  str,
  num,
  toDate,
  logSummary,
  resolve,
} from './utils';
import Invoice from '../../models/Invoice';

const INVOICES_CSV = 'exports/invoices.csv';
const ITEMS_CSV = 'exports/invoice_items.csv';

const VALID_STATUSES = ['unpaid', 'partial', 'paid', 'refunded'];
const VALID_PAYMENT_METHODS = [
  'cash', 'gcash', 'bank_transfer', 'card', 'check', 'insurance', 'hmo', 'other',
];

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(INVOICES_CSV);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  // Build item map: { invoice_id: [...items] }
  let itemMap: Record<string, Record<string, string>[]> = {};
  const itemsFilePath = path.resolve(ITEMS_CSV);
  if (fs.existsSync(itemsFilePath)) {
    const itemRows = readCSV(ITEMS_CSV);
    for (const item of itemRows) {
      if (!itemMap[item.invoice_id]) itemMap[item.invoice_id] = [];
      itemMap[item.invoice_id].push(item);
    }
  } else {
    console.warn(`  ⚠️  ${ITEMS_CSV} not found — invoices will be created with empty items`);
  }

  const patientMap = loadIdMap('patients');

  console.log(`\n🔄  Migrating ${rows.length} invoices…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const patientId = resolve(patientMap, row.patient_id);
    if (!patientId) { skipped++; continue; }

    const invoiceNumber = str(row.invoice_number) ?? `INV-MIGRATED-${row.id}`;

    // Build items array
    const rawItems = itemMap[row.id] ?? [];
    const items = rawItems.map((item) => ({
      description: str(item.description) ?? 'Migrated item',
      code: str(item.code),
      category: str(item.category),
      quantity: num(item.quantity) ?? 1,
      unitPrice: num(item.unit_price) ?? 0,
      total: num(item.total) ?? 0,
    }));

    // If no separate items CSV, create a single synthetic item from invoice totals
    if (items.length === 0) {
      items.push({
        description: 'Migrated invoice total',
        code: undefined,
        category: undefined,
        quantity: 1,
        unitPrice: num(row.total) ?? 0,
        total: num(row.total) ?? 0,
      });
    }

    // Build discounts
    const discounts = [];
    if (str(row.discount_type) && num(row.discount_amount)) {
      discounts.push({
        type: (['pwd', 'senior', 'membership', 'promotional', 'other'].includes(row.discount_type)
          ? row.discount_type
          : 'other') as any,
        amount: num(row.discount_amount) ?? 0,
      });
    }

    // Build payment
    const payments = [];
    if (num(row.payment_amount) && num(row.payment_amount)! > 0) {
      payments.push({
        method: (VALID_PAYMENT_METHODS.includes(row.payment_method)
          ? row.payment_method
          : 'cash') as any,
        amount: num(row.payment_amount)!,
        date: toDate(row.payment_date) ?? new Date(),
        receiptNo: str(row.receipt_no),
      });
    }

    const status = VALID_STATUSES.includes(row.status ?? '') ? row.status : 'unpaid';

    try {
      const doc = await Invoice.findOneAndUpdate(
        { invoiceNumber },
        {
          $setOnInsert: {
            patient: patientId,
            invoiceNumber,
            items,
            subtotal: num(row.subtotal),
            tax: num(row.tax),
            total: num(row.total),
            discounts,
            payments,
            status,
            createdAt: toDate(row.created_at) ?? new Date(),
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

  saveIdMap('invoices', idMap);
  logSummary('Invoices', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
