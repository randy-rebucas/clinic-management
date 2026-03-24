/**
 * Step 09 — Migrate Prescriptions
 *
 * Expected CSV location:
 *   exports/prescriptions.csv      — one row per prescription
 *   exports/prescription_items.csv — one row per prescribed medication
 *
 * Minimum expected MySQL columns (prescriptions.csv):
 *   id, patient_id, doctor_id, appointment_id, diagnosis,
 *   notes, created_at, status
 *
 * Minimum expected MySQL columns (prescription_items.csv):
 *   prescription_id, medicine_id, medicine_name, dosage, frequency,
 *   duration, quantity, instructions
 *
 * Depends on: 02-doctors, 03-patients, 04-appointments, 06-medicines
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
import Prescription from '../../models/Prescription';

const PRESCRIPTIONS_CSV = 'exports/prescriptions.csv';
const ITEMS_CSV = 'exports/prescription_items.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(PRESCRIPTIONS_CSV);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  // Build medication map: { prescription_id: [...items] }
  const medMap: Record<string, Record<string, string>[]> = {};
  const itemsPath = path.resolve(ITEMS_CSV);
  if (fs.existsSync(itemsPath)) {
    const itemRows = readCSV(ITEMS_CSV);
    for (const item of itemRows) {
      if (!medMap[item.prescription_id]) medMap[item.prescription_id] = [];
      medMap[item.prescription_id].push(item);
    }
  } else {
    console.warn(`  ⚠️  ${ITEMS_CSV} not found — prescriptions will have empty medications`);
  }

  const patientMap = loadIdMap('patients');
  const doctorMap = loadIdMap('doctors');
  const appointmentMap = loadIdMap('appointments');
  const medicineMap = loadIdMap('medicines');

  console.log(`\n🔄  Migrating ${rows.length} prescriptions…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const patientId = resolve(patientMap, row.patient_id);
    if (!patientId) { skipped++; continue; }

    const doctorId = resolve(doctorMap, row.doctor_id);
    const appointmentId = resolve(appointmentMap, row.appointment_id);

    // Build medications list
    const rawMeds = medMap[row.id] ?? [];
    const medications = rawMeds.map((item) => ({
      medicine: resolve(medicineMap, item.medicine_id) ?? undefined,
      medicineName: str(item.medicine_name) ?? 'Unknown',
      dosage: str(item.dosage),
      frequency: str(item.frequency),
      duration: str(item.duration),
      quantity: num(item.quantity),
      instructions: str(item.instructions),
    }));

    try {
      const doc = await Prescription.create({
        patient: patientId,
        doctor: doctorId ?? undefined,
        appointment: appointmentId ?? undefined,
        diagnosis: str(row.diagnosis),
        notes: str(row.notes),
        medications,
        status: (['active', 'completed', 'cancelled'].includes(row.status ?? '')
          ? row.status
          : 'active'),
        createdAt: toDate(row.created_at) ?? new Date(),
      });
      idMap[row.id] = doc._id.toString();
      process.stdout.write('.');
    } catch (err: any) {
      console.error(`\n  ❌  Row id=${row.id}: ${err.message}`);
      skipped++;
    }
  }

  saveIdMap('prescriptions', idMap);
  logSummary('Prescriptions', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
