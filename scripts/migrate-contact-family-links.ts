/**
 * Limits family links made through a contact number to one clinic.
 *
 * An eMCR claim used to link a minor at every clinic when the caller's number was only the child's
 * contact number, after a first name and birth date. Claims now stay at the record's clinic, and
 * this does the same for links made before that. A link stays as it is when the holder's number is
 * the child's own number on any of the child's records. Narrowing a link that was fine costs a
 * parent the other clinics' records until they are linked again; it exposes nothing.
 *
 * Applying writes an undo file to backups/ first. Records merged by old claims aren't separated.
 *
 *   npx tsx scripts/migrate-contact-family-links.ts            # dry run (default): report only
 *   npx tsx scripts/migrate-contact-family-links.ts --apply    # write changes
 *   pnpm prod db:migrate:contact-family-links                  # production dry run
 *   pnpm prod db:migrate:contact-family-links --apply          # production
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

import mongoose, { Model, Types } from 'mongoose';
import { normalizePhone } from '../lib/phone';

const APPLY = process.argv.includes('--apply');

type Id = Types.ObjectId;
type Guardian = { patient: Id; source: string; tenantId?: Id };
type PatientRow = { _id: Id; phone?: string; accountId?: Id; tenantIds?: Id[]; guardians?: Guardian[] };
type AccountRow = { _id: Id; phone?: string; selfPatientId?: Id; dependents?: { patientId: Id; source: string; tenantId?: Id }[] };
type Undo = { patients: { patientId: string; holder: string }[]; accounts: { accountId: string; patientId: string }[] };

const norm = (phone?: string) => (phone ? normalizePhone(phone) : null);

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  console.log(APPLY ? 'MODE: APPLY (writing changes)' : 'MODE: DRY RUN (no changes; pass --apply to write)');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });

  const Patient = (await import('../models/Patient')).default as Model<any>;
  const EmcrAccount = (await import('../models/EmcrAccount')).default as Model<any>;
  const patients = Patient.collection;
  const accounts = EmcrAccount.collection;

  const row = { projection: { phone: 1, accountId: 1, tenantIds: 1, guardians: 1 } };
  const person = async (record: PatientRow) =>
    record.accountId ? ((await patients.find({ accountId: record.accountId }, row).toArray()) as unknown as PatientRow[]) : [record];
  const ownNumbers = async (records: PatientRow[]) => new Set(records.map((r) => norm(r.phone)).filter(Boolean));

  const undo: Undo = { patients: [], accounts: [] };
  const fixes: (() => Promise<unknown>)[] = [];
  let kept = 0;
  let noClinic = 0;

  // Links on the child's record, for a holder who has a record.
  const linked = (await patients
    .find({ guardians: { $elemMatch: { source: 'phone', tenantId: { $exists: false } } } }, row)
    .toArray()) as unknown as PatientRow[];
  for (const child of linked) {
    const childNumbers = await ownNumbers(await person(child));
    for (const link of child.guardians ?? []) {
      if (link.source !== 'phone' || link.tenantId) continue;
      const holder = (await patients.findOne({ _id: link.patient }, row)) as unknown as PatientRow | null;
      const holderRecords = holder ? await person(holder) : [];
      const holderAccounts = (await accounts
        .find({ selfPatientId: { $in: holderRecords.map((r) => r._id) } }, { projection: { phone: 1 } })
        .toArray()) as unknown as AccountRow[];
      const numbers = [...holderRecords.map((r) => norm(r.phone)), ...holderAccounts.map((a) => norm(a.phone))];
      if (numbers.some((n) => n && childNumbers.has(n))) {
        kept++;
        continue;
      }
      const tenantId = child.tenantIds?.[0];
      if (!tenantId) {
        noClinic++;
        continue;
      }
      undo.patients.push({ patientId: String(child._id), holder: String(link.patient) });
      fixes.push(() =>
        patients.updateOne(
          { _id: child._id },
          { $set: { 'guardians.$[g].tenantId': tenantId } },
          { arrayFilters: [{ 'g.patient': link.patient, 'g.source': 'phone', 'g.tenantId': { $exists: false } }] }
        )
      );
    }
  }

  // Links on the account, for a holder with no record.
  const holders = (await accounts
    .find({ dependents: { $elemMatch: { source: 'phone_dob', tenantId: { $exists: false } } } }, { projection: { phone: 1, dependents: 1 } })
    .toArray()) as unknown as AccountRow[];
  for (const account of holders) {
    for (const link of account.dependents ?? []) {
      if (link.source !== 'phone_dob' || link.tenantId) continue;
      const child = (await patients.findOne({ _id: link.patientId }, row)) as unknown as PatientRow | null;
      if (!child) continue;
      if ((await ownNumbers(await person(child))).has(norm(account.phone))) {
        kept++;
        continue;
      }
      const tenantId = child.tenantIds?.[0];
      if (!tenantId) {
        noClinic++;
        continue;
      }
      undo.accounts.push({ accountId: String(account._id), patientId: String(link.patientId) });
      fixes.push(() =>
        accounts.updateOne(
          { _id: account._id },
          { $set: { 'dependents.$[d].tenantId': tenantId } },
          { arrayFilters: [{ 'd.patientId': link.patientId, 'd.source': 'phone_dob', 'd.tenantId': { $exists: false } }] }
        )
      );
    }
  }

  console.log(`own-number links, left unchanged: ${kept}`);
  console.log(`${APPLY ? 'limited' : 'would limit'} to one clinic: ${undo.patients.length} on records, ${undo.accounts.length} on accounts`);
  console.log(`no clinic on the record, left unchanged: ${noClinic}`);

  if (APPLY && fixes.length) {
    const dir = path.resolve(process.cwd(), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `contact-family-links-undo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(undo, null, 2));
    console.log(`undo file: ${file}`);
    for (const fix of fixes) await fix();
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
