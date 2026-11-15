/**
 * Creates (or refreshes) a demo patient for App Store / Google Play reviewers of the eMCR app,
 * at its own demo clinic, with sample records so every main screen has something to show.
 * Safe to run again: it resets the password and rebuilds the sample records with fresh dates
 * (the upcoming appointment stays upcoming).
 *
 *   pnpm db:create-demo-patient                                   # local database
 *   pnpm prod db:create-demo-patient                              # production (asks y/N first)
 *   pnpm prod db:create-demo-patient -- --password "<password>"   # choose the password
 *
 * Sign in on the eMCR sign-in screen with the email + password (the email path, not a mobile
 * number or login ID). Reviewers can't receive SMS codes, so the phone is a placeholder that is
 * never verified.
 *
 * What it makes, all in the "emcr-demo" clinic (no staff can sign in to it):
 *   - the clinic, with SMS, email and reminders switched off, and a one-year Professional plan
 *   - a doctor (profile + an inactive, password-less staff user, so it can't sign in)
 *   - the patient, plus an activated eMCR account (Plus, one year) in case the paid gate is on
 *   - two past visits with vitals, a prescription, a reviewed lab result, a paid and an unpaid
 *     invoice, an upcoming appointment and a completed one
 *
 * Inserts go through Model.insertMany: schema validation and defaults apply, save hooks don't
 * (the Doctor hook would create a staff login, others send notifications).
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose, { Model, Types } from 'mongoose';
import { describeMongoUri } from './dev-db/guard';

const DEMO_SUBDOMAIN = 'emcr-demo';
/** Also the marker that the clinic is ours: the script refuses to touch a clinic without it. */
const DEMO_TENANT_EMAIL = 'emcr-demo@myclinicsoft.solutions';
/** Not @myclinicsoft.solutions: the app sends those to the eMCR login-ID sign-in (LOGIN_ID_DOMAIN). */
const DEFAULT_EMAIL = 'emcrreview@demo.myclinicsoft.solutions';
const PATIENT_CODE = 'DEMO-0001';
const PLACEHOLDER_PHONE = '09000000000'; // never verified: no SMS sign-in, no record linking
const TZ = 'Asia/Manila';
const DAY_MS = 24 * 60 * 60 * 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 16 characters, letters and digits only, so it's easy to paste into the store consoles. */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(16), (b) => alphabet[b % alphabet.length]).join('');
}

/** Manila calendar date `offsetDays` from today, as YYYY-MM-DD. */
function manilaDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** A Manila wall-clock time as a Date (Manila is UTC+8, no DST). */
function manilaAt(offsetDays: number, time: string): Date {
  return new Date(`${manilaDate(offsetDays)}T${time}:00+08:00`);
}

/** Next Manila weekday (Mon–Fri) at least `minDays` ahead. */
function nextWeekdayOffset(minDays: number): number {
  for (let d = minDays; ; d++) {
    const day = new Date(`${manilaDate(d)}T12:00:00+08:00`).getUTCDay();
    if (day >= 1 && day <= 5) return d;
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set.');

  const email = (arg('email') ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = arg('password') ?? process.env.DEMO_PATIENT_PASSWORD ?? generatePassword();
  if (password.length < 8) throw new Error('The password must be at least 8 characters.');

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const load = async (name: string) => (await import(`../models/${name}`)).default as Model<any>;
  const [Tenant, Settings, Role, User, Specialization, Doctor, Patient, EmcrAccount, Appointment, Visit, Prescription, LabResult, Invoice] =
    await Promise.all(
      ['Tenant', 'Settings', 'Role', 'User', 'Specialization', 'Doctor', 'Patient', 'EmcrAccount', 'Appointment', 'Visit', 'Prescription', 'LabResult', 'Invoice'].map(load)
    );

  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * DAY_MS);

  // ── Clinic ────────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ subdomain: DEMO_SUBDOMAIN }).lean<any>();
  if (tenant && tenant.email !== DEMO_TENANT_EMAIL) {
    throw new Error(`A clinic "${DEMO_SUBDOMAIN}" already exists and wasn't made by this script. Not touching it.`);
  }
  const tenantFields = {
    name: 'MyClinicSoft Demo Clinic',
    displayName: 'MyClinicSoft Demo Clinic',
    email: DEMO_TENANT_EMAIL,
    phone: '+63 2 8000 0000',
    address: { street: '123 Demo Street', city: 'Makati City', state: 'Metro Manila', zipCode: '1226', country: 'Philippines' },
    'settings.timezone': TZ,
    'settings.currency': 'PHP',
    status: 'active',
    'subscription.plan': 'professional',
    'subscription.status': 'active',
    'subscription.billingCycle': 'yearly',
    'subscription.expiresAt': oneYear,
  };
  if (tenant) {
    await Tenant.updateOne({ _id: tenant._id }, { $set: tenantFields });
  } else {
    const [created] = await Tenant.insertMany([
      {
        ...tenantFields,
        subdomain: DEMO_SUBDOMAIN,
        settings: { timezone: TZ, currency: 'PHP', dateFormat: 'MM/DD/YYYY' },
        subscription: { plan: 'professional', status: 'active', billingCycle: 'yearly', expiresAt: oneYear },
      },
    ]);
    tenant = created.toObject();
  }
  const tenantId: Types.ObjectId = tenant._id;

  // Nothing leaves the demo clinic: no texts, emails or reminders to the placeholder contact.
  const comms = {
    'communicationSettings.smsEnabled': false,
    'communicationSettings.emailEnabled': false,
    'communicationSettings.appointmentReminders': false,
    'communicationSettings.labResultNotifications': false,
    'communicationSettings.invoiceReminders': false,
  };
  if (await Settings.exists({ tenantId })) {
    await Settings.updateOne({ tenantId }, { $set: { clinicName: tenantFields.name, ...comms } });
  } else {
    await Settings.insertMany([
      {
        tenantId,
        clinicName: tenantFields.name,
        clinicAddress: '123 Demo Street, Makati City, Metro Manila 1226',
        clinicPhone: tenantFields.phone,
        clinicEmail: DEMO_TENANT_EMAIL,
        communicationSettings: {
          smsEnabled: false,
          emailEnabled: false,
          appointmentReminders: false,
          labResultNotifications: false,
          invoiceReminders: false,
        },
      },
    ]);
  }

  // ── Doctor ────────────────────────────────────────────────────────────────
  const specialization = await Specialization.findOneAndUpdate(
    { name: 'Family Medicine' },
    { $setOnInsert: { name: 'Family Medicine', active: true } },
    { upsert: true, returnDocument: 'after' }
  ).lean<any>();

  const doctorRole = await Role.findOneAndUpdate(
    { name: 'doctor', tenantId },
    { $setOnInsert: { name: 'doctor', tenantId, displayName: 'Doctor', description: 'Demo clinic doctor', level: 80, isActive: true } },
    { upsert: true, returnDocument: 'after' }
  ).lean<any>();

  const doctorEmail = 'doctor@emcr-demo.myclinicsoft.solutions';
  let doctor = await Doctor.findOne({ tenantId, email: doctorEmail }).lean<any>();
  if (!doctor) {
    [doctor] = await Doctor.insertMany([
      {
        tenantId,
        firstName: 'Maria',
        lastName: 'Santos',
        email: doctorEmail,
        phone: PLACEHOLDER_PHONE,
        specializationId: specialization._id,
        licenseNumber: 'DEMO-0000000',
        status: 'active',
        schedule: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '17:00', isAvailable: true })),
      },
    ]);
    doctor = doctor.toObject();
  }

  // Visits and prescriptions name their provider through a staff user. This one can't sign in:
  // status inactive, and its password is a hash of random bytes nobody knows.
  let doctorUser = await User.findOne({ tenantId, email: doctorEmail }).lean<any>();
  if (!doctorUser) {
    [doctorUser] = await User.insertMany([
      {
        tenantId,
        name: 'Dr. Maria Santos',
        email: doctorEmail,
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
        role: doctorRole._id,
        doctorProfile: doctor._id,
        status: 'inactive',
      },
    ]);
    doctorUser = doctorUser.toObject();
  }

  // ── Patient ───────────────────────────────────────────────────────────────
  const existingByCode = await Patient.findOne({ patientCode: PATIENT_CODE }).select('tenantIds').lean<any>();
  if (existingByCode && !(existingByCode.tenantIds ?? []).some((t: Types.ObjectId) => String(t) === String(tenantId))) {
    throw new Error(`Patient code ${PATIENT_CODE} belongs to a real clinic's patient. Not touching it.`);
  }
  const emailTaken = await Patient.exists({ email, _id: { $ne: existingByCode?._id ?? null }, password: { $exists: true, $nin: [null, ''] } });
  if (emailTaken) throw new Error(`Another patient already signs in with ${email}. Use --email to pick another address.`);

  const hash = await bcrypt.hash(password, 12);
  const patientFields = {
    tenantIds: [tenantId],
    patientCode: PATIENT_CODE,
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    dateOfBirth: new Date('1990-04-25T00:00:00Z'),
    sex: 'male',
    civilStatus: 'married',
    nationality: 'Filipino',
    occupation: 'Teacher',
    email,
    phone: PLACEHOLDER_PHONE,
    address: { street: '45 Sample Avenue', city: 'Makati City', state: 'Metro Manila', zipCode: '1226' },
    emergencyContact: { name: 'Ana Dela Cruz', phone: PLACEHOLDER_PHONE, relationship: 'Spouse' },
    medicalHistory: 'Seasonal allergic rhinitis. No surgeries.',
    preExistingConditions: [{ condition: 'Hypertension, stage 1', diagnosisDate: new Date('2023-02-10'), status: 'chronic' }],
    allergies: [{ substance: 'Penicillin', reaction: 'Rash', severity: 'moderate' }],
    immunizations: [
      { name: 'Influenza vaccine', date: new Date(now.getTime() - 200 * DAY_MS) },
      { name: 'COVID-19 booster', date: new Date('2024-01-15') },
    ],
    password: hash,
    active: true,
  };

  let patientId: Types.ObjectId;
  if (existingByCode) {
    patientId = existingByCode._id;
    // New password: sign out any device still holding the old one.
    await Patient.updateOne(
      { _id: patientId },
      {
        $set: patientFields,
        $unset: { passwordTenantId: '', loginQrTokenHash: '', loginQrTokenExpiry: '', loginQrTenantId: '', otp: '', otpExpiry: '' },
        $inc: { sessionVersion: 1 },
      }
    );
  } else {
    const [created] = await Patient.insertMany([patientFields]);
    patientId = created._id;
  }

  // eMCR account: activated, so nothing asks for a voucher if EMCR_ACTIVATION_ENFORCED is on.
  const activation = { plan: 'plus', activatedAt: now, expiresAt: oneYear };
  const history = { source: 'manual', plan: 'plus', ref: 'app-store-review', days: 365, expiresAt: oneYear, at: now, by: 'scripts/create-demo-patient' };
  if (await EmcrAccount.exists({ selfPatientId: patientId })) {
    await EmcrAccount.updateOne({ selfPatientId: patientId }, { $set: { activation, disabled: false }, $push: { activationHistory: history } });
  } else {
    await EmcrAccount.insertMany([{ selfPatientId: patientId, activation, activationHistory: [history] }]);
  }

  // ── Sample records (rebuilt each run, so dates stay current) ──────────────
  const mine = { tenantId, patient: patientId };
  await Promise.all([Appointment, Visit, Prescription, LabResult, Invoice].map((m) => m.deleteMany(mine)));

  const visitDays = [-45, -7];
  const [visitOld, visitRecent] = await Visit.insertMany([
    {
      ...mine,
      visitCode: 'DEMO-V-0001',
      date: manilaAt(visitDays[0], '10:00'),
      provider: doctorUser._id,
      visitType: 'checkup',
      chiefComplaint: 'Annual check-up',
      vitals: { bp: '132/84', hr: 76, rr: 16, tempC: 36.6, spo2: 98, heightCm: 170, weightKg: 74, bmi: 25.6 },
      diagnoses: [{ code: 'I10', description: 'Essential (primary) hypertension', primary: true }],
      soapNotes: {
        subjective: 'No complaints. Here for yearly check-up.',
        objective: 'BP 132/84. Otherwise unremarkable.',
        assessment: 'Stage 1 hypertension, controlled with lifestyle.',
        plan: 'Low-salt diet, walk 30 minutes a day. Recheck in 6 weeks.',
      },
      treatmentPlan: { lifestyle: [{ category: 'Diet', instructions: 'Limit salt to under 5 g a day.' }] },
      status: 'closed',
    },
    {
      ...mine,
      visitCode: 'DEMO-V-0002',
      date: manilaAt(visitDays[1], '14:30'),
      provider: doctorUser._id,
      visitType: 'consultation',
      chiefComplaint: 'Sore throat and fever for 2 days',
      vitals: { bp: '128/82', hr: 88, rr: 18, tempC: 38.1, spo2: 97, heightCm: 170, weightKg: 73, bmi: 25.3 },
      diagnoses: [{ code: 'J02.9', description: 'Acute pharyngitis, unspecified', primary: true }],
      soapNotes: {
        subjective: 'Sore throat and fever since 2 days ago. No cough.',
        objective: 'Temp 38.1 °C. Throat red, no exudate.',
        assessment: 'Acute pharyngitis, likely viral.',
        plan: 'Paracetamol for fever, rest and fluids. CBC requested.',
      },
      treatmentPlan: { followUp: { date: manilaAt(14, '09:00'), instructions: 'Come back if fever lasts more than 3 days.' } },
      status: 'closed',
    },
  ]);

  const [prescription] = await Prescription.insertMany([
    {
      ...mine,
      prescriptionCode: 'DEMO-RX-0001',
      visit: visitRecent._id,
      prescribedBy: doctorUser._id,
      issuedAt: visitRecent.date,
      medications: [
        { name: 'Paracetamol', genericName: 'Paracetamol', form: 'tablet', strength: '500 mg', dose: '500 mg', route: 'oral', frequency: 'Every 6 hours as needed for fever', durationDays: 5, quantity: 20, instructions: 'Take after meals. No more than 4 tablets a day.' },
        { name: 'Amlodipine', genericName: 'Amlodipine', form: 'tablet', strength: '5 mg', dose: '5 mg', route: 'oral', frequency: 'Once a day', durationDays: 30, quantity: 30, instructions: 'Take in the morning.' },
      ],
      notes: 'Drink plenty of fluids.',
      status: 'active',
      digitalSignature: { providerName: 'Dr. Maria Santos', signedAt: visitRecent.date },
    },
  ]);

  const resultDate = manilaAt(visitDays[1] + 1, '11:00');
  const [lab] = await LabResult.insertMany([
    {
      ...mine,
      visit: visitRecent._id,
      orderedBy: doctorUser._id,
      orderDate: visitRecent.date,
      requestCode: 'DEMO-LAB-0001',
      orderCode: 'DEMO-LO-0001',
      request: { testType: 'Complete Blood Count (CBC)', testCode: 'CBC', urgency: 'routine' },
      results: { hemoglobin: 14.2, hematocrit: 42, wbc: 11.8, platelets: 250 },
      referenceRanges: { hemoglobin: '13.5–17.5 g/dL', hematocrit: '41–53 %', wbc: '4.5–11.0 ×10⁹/L', platelets: '150–400 ×10⁹/L' },
      abnormalFlags: { hemoglobin: 'normal', hematocrit: 'normal', wbc: 'high', platelets: 'normal' },
      interpretation: 'Slightly high white cell count, consistent with an infection. Otherwise normal.',
      resultDate,
      status: 'reviewed',
      performedBy: doctorUser._id,
      reviewedBy: doctorUser._id,
      reviewedAt: resultDate,
      notificationSent: true,
    },
  ]);

  await Visit.updateOne({ _id: visitRecent._id }, { $set: { prescriptions: [prescription._id], labsOrdered: [lab._id] } });

  await Invoice.insertMany([
    {
      ...mine,
      visit: visitOld._id,
      invoiceNumber: 'DEMO-INV-0001',
      billedTo: { name: 'Juan Dela Cruz' },
      items: [{ code: 'CONSULT', description: 'Annual check-up', category: 'consultation', quantity: 1, unitPrice: 800, total: 800 }],
      subtotal: 800,
      total: 800,
      payments: [{ method: 'cash', amount: 800, date: visitOld.date }],
      totalPaid: 800,
      outstandingBalance: 0,
      status: 'paid',
      createdAt: visitOld.date,
    },
    {
      ...mine,
      visit: visitRecent._id,
      invoiceNumber: 'DEMO-INV-0002',
      billedTo: { name: 'Juan Dela Cruz' },
      items: [
        { code: 'CONSULT', description: 'Consultation', category: 'consultation', quantity: 1, unitPrice: 600, total: 600 },
        { code: 'CBC', description: 'Complete Blood Count (CBC)', category: 'laboratory', quantity: 1, unitPrice: 350, total: 350 },
      ],
      subtotal: 950,
      total: 950,
      payments: [],
      totalPaid: 0,
      outstandingBalance: 950,
      status: 'unpaid',
      createdAt: visitRecent.date,
    },
  ]);

  const upcomingDay = nextWeekdayOffset(5);
  const date = (offset: number) => new Date(manilaDate(offset)); // UTC midnight of the clinic day, as bookings store it
  await Appointment.insertMany([
    {
      ...mine,
      doctor: doctor._id,
      appointmentCode: 'DEMO-APT-0001',
      appointmentDate: date(visitDays[1]),
      appointmentTime: '14:30',
      duration: 30,
      reason: 'Sore throat and fever',
      status: 'completed',
    },
    {
      ...mine,
      doctor: doctor._id,
      appointmentCode: 'DEMO-APT-0002',
      appointmentDate: date(upcomingDay),
      appointmentTime: '10:00',
      duration: 30,
      reason: 'Blood pressure follow-up',
      status: 'confirmed',
    },
  ]);

  await mongoose.disconnect();

  console.log(`\n✅  Demo patient ${existingByCode ? 'refreshed' : 'created'} in ${describeMongoUri(uri)}`);
  console.log(`    clinic:   ${tenantFields.name} (${DEMO_SUBDOMAIN})`);
  console.log(`    email:    ${email}`);
  console.log(`    password: ${password}`);
  console.log(`    upcoming appointment: ${manilaDate(upcomingDay)} 10:00 with Dr. Maria Santos`);
  console.log('    In eMCR, sign in with the email + password (not a mobile number).\n');
}

main().catch(async (err) => {
  console.error(`❌  ${err instanceof Error ? err.message : err}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
