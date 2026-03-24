/**
 * Step 04 — Migrate Appointments
 *
 * Expected CSV location: exports/appointments.csv
 *
 * Minimum expected MySQL columns:
 *   id, patient_id, doctor_id, appointment_date, appointment_time,
 *   duration, status, reason, notes, is_walk_in, queue_number, room
 *
 * Depends on: 02-doctors, 03-patients
 */

import {
  connectDB,
  disconnectDB,
  readCSV,
  saveIdMap,
  loadIdMap,
  str,
  num,
  toBool,
  toDate,
  logSummary,
  resolve,
} from './utils';
import Appointment from '../../models/Appointment';

const CSV_PATH = 'exports/appointments.csv';

const VALID_STATUSES = [
  'pending', 'scheduled', 'confirmed', 'rescheduled',
  'no-show', 'completed', 'cancelled',
];

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

  console.log(`\n🔄  Migrating ${rows.length} appointments…`);

  const idMap: Record<string, string> = {};
  let skipped = 0;

  for (const row of rows) {
    const patientId = resolve(patientMap, row.patient_id);
    if (!patientId) { skipped++; continue; }

    const doctorId = resolve(doctorMap, row.doctor_id);
    const appointmentDate = toDate(row.appointment_date);
    if (!appointmentDate) { skipped++; continue; }

    const status = VALID_STATUSES.includes(row.status ?? '')
      ? row.status
      : 'scheduled';

    try {
      const doc = await Appointment.create({
        patient: patientId,
        doctor: doctorId ?? undefined,
        appointmentDate,
        appointmentTime: str(row.appointment_time),
        duration: num(row.duration) ?? 30,
        status,
        reason: str(row.reason),
        notes: str(row.notes),
        isWalkIn: toBool(row.is_walk_in),
        queueNumber: num(row.queue_number),
        room: str(row.room),
      });
      idMap[row.id] = doc._id.toString();
      process.stdout.write('.');
    } catch (err: any) {
      console.error(`\n  ❌  Row id=${row.id}: ${err.message}`);
      skipped++;
    }
  }

  saveIdMap('appointments', idMap);
  logSummary('Appointments', rows.length, skipped);

  await disconnectDB();
}

main().catch((e) => { console.error(e); process.exit(1); });
