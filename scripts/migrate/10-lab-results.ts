/**
 * Step 10 — Migrate Lab Results
 *
 * Expected CSV location: exports/lab_results.csv
 *
 * Minimum expected MySQL columns:
 *   id, patient_id, doctor_id, appointment_id, test_name, test_type,
 *   result, unit, reference_range, status, notes, performed_at, created_at
 *
 * Depends on: 02-doctors, 03-patients, 04-appointments
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  loadIdMap,
  str,
  toDate,
  logSummary,
  resolve,
} from './utils';
import LabResult from '../../models/LabResult';

const CSV_PATH = 'exports/lab_results.csv';

async function main() {
  await connectDB();

  let rows: Record<string, string>[];
  try {
    rows = readCSV(CSV_PATH);
  } catch (e: any) {
    console.error(`❌  ${e.message}`);
    process.exit(1);
  }

  const patientMap = loadIdMap('patients');
  const doctorMap = loadIdMap('doctors');
  const appointmentMap = loadIdMap('appointments');

  console.log(`\n🔄  Migrating ${rows.length} lab results…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const patientId = resolve(patientMap, row.patient_id);
    if (!patientId) { skipped++; continue; }

    const testName = str(row.test_name);
    if (!testName) { skipped++; continue; }

    const doctorId = resolve(doctorMap, row.doctor_id);
    const appointmentId = resolve(appointmentMap, row.appointment_id);

    try {
      const doc = await LabResult.create({
        patient: patientId,
        doctor: doctorId ?? undefined,
        appointment: appointmentId ?? undefined,
        testName,
        testType: str(row.test_type),
        result: str(row.result),
        unit: str(row.unit),
        referenceRange: str(row.reference_range),
        status: (['pending', 'completed', 'cancelled'].includes(row.status ?? '')
          ? row.status
          : 'completed'),
        notes: str(row.notes),
        performedAt: toDate(row.performed_at),
        createdAt: toDate(row.created_at) ?? new Date(),
      });
      idMap[row.id] = doc._id.toString();
      process.stdout.write('.');
    } catch (err: any) {
      console.error(`\n  ❌  Row id=${row.id}: ${err.message}`);
      skipped++;
    }
  }

  saveIdMap('lab_results', idMap);
  logSummary('Lab Results', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
