/**
 * Anonymizes a restored copy of production for local development: people get fake names and
 * dev-only contacts, staff get a known password, and secrets, tokens and file links are removed.
 *
 * Rules: raw driver calls only (Mongoose save hooks on staff and medical reps send invite emails),
 * and nothing that touches Cloudinary or another outside service. Fake values are derived from each
 * document's _id, so unique indexes hold and a rerun gives the same result.
 * Patient fields follow the "anonymize" rules in lib/patient-erasure.ts (IDENTIFYING_FIELDS).
 *
 * Run through scripts/dev-db/refresh.ts, which checks the database is local first.
 */

import bcrypt from 'bcryptjs';
import type { mongo } from 'mongoose';

type Db = mongo.Db;
type Document = mongo.Document;
type ObjectId = mongo.ObjectId;
type AnyBulkWriteOperation<T extends Document> = mongo.AnyBulkWriteOperation<T>;

export const DEV_PASSWORD = 'devpassword';
const REDACTED = '[redacted]';
const DEV_ADDRESS = { street: '123 Dev Street', city: 'Devtown', state: 'Metro Dev', zipCode: '0000' };

const FIRST_NAMES = [
  'Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Miguel', 'Carmen', 'Antonio', 'Luz', 'Ramon', 'Elena',
  'Carlos', 'Teresa', 'Manuel', 'Josefina', 'Ricardo', 'Cristina', 'Eduardo', 'Gloria', 'Fernando', 'Isabel',
  'Roberto', 'Patricia', 'Andres', 'Lourdes', 'Gabriel', 'Angelica', 'Daniel', 'Marites',
];
const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Tomas', 'Andrada',
  'Castillo', 'Flores', 'Villanueva', 'Ramos', 'Castro', 'Rivera', 'Aquino', 'Navarro', 'Salazar', 'Mercado',
  'Domingo', 'Gonzales', 'Lopez', 'Del Rosario', 'Dela Cruz', 'Pascual', 'Soriano', 'Valdez', 'Manalo', 'Lim',
];

/** Copies of data, credentials and device links; emptied (not dropped, so their indexes stay). */
const EMPTY = ['backuprecords', 'refreshtokens', 'platformnonces', 'webhookdeliveries', 'mobiledevices', 'pushsubscriptions', 'apikeys'];

/** Staff profile collections and the User field that links each. */
const PROFILES: [collection: string, userField: string][] = [
  ['admins', 'adminProfile'],
  ['doctors', 'doctorProfile'],
  ['nurses', 'nurseProfile'],
  ['receptionists', 'receptionistProfile'],
  ['accountants', 'accountantProfile'],
  ['medicaltechnologists', 'medicalTechnologistProfile'],
  ['medicalrepresentatives', 'medicalRepresentativeProfile'],
  ['staffs', 'staffInfo'],
];

const id8 = (id: ObjectId) => id.toHexString().slice(-8);
const seed = (id: ObjectId) => parseInt(id.toHexString().slice(-6), 16);
const nameFor = (n: number) => ({
  first: FIRST_NAMES[n % FIRST_NAMES.length],
  last: LAST_NAMES[Math.floor(n / FIRST_NAMES.length) % LAST_NAMES.length],
});
const fakeName = (id: ObjectId) => nameFor(seed(id));
// 0900 isn't a mobile prefix in use, so fake numbers are recognisable (selfCheck relies on it).
const fakePhone = (id: ObjectId) => `0900${String(seed(id) % 10_000_000).padStart(7, '0')}`;

export interface DevLogin {
  email: string;
  role: string;
  clinic: string;
}

export interface ScrubResult {
  logins: DevLogin[];
  problems: string[];
}

async function bulk(db: Db, collection: string, ops: AnyBulkWriteOperation<Document>[]) {
  for (let i = 0; i < ops.length; i += 1000) {
    await db.collection(collection).bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
}

/** Set `field` to `value` on every document that has it. */
async function overwriteWhereSet(db: Db, collection: string, field: string, value: unknown) {
  await db.collection(collection).updateMany({ [field]: { $exists: true, $ne: null } }, { $set: { [field]: value } });
}

export async function scrubDatabase(db: Db, log: (msg: string) => void = console.log): Promise<ScrubResult> {
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  // 1. Empty copies, tokens and device links.
  for (const name of EMPTY) {
    if (existing.has(name)) await db.collection(name).deleteMany({});
  }
  log(`  emptied: ${EMPTY.filter((n) => existing.has(n)).join(', ') || '(none present)'}`);

  // 2. Patients: fake identity, no contacts, IDs, credentials or files. Clinical fields stay.
  const patientNames = new Map<string, string>();
  const patientOps: AnyBulkWriteOperation<Document>[] = [];
  for await (const p of db.collection('patients').find({}, { projection: { email: 1, dateOfBirth: 1, emergencyContact: 1 } })) {
    const { first, last } = fakeName(p._id);
    patientNames.set(String(p._id), `${first} ${last}`);
    const set: Record<string, unknown> = {
      firstName: first,
      lastName: last,
      phone: fakePhone(p._id),
      address: DEV_ADDRESS,
      attachments: [],
    };
    if (p.email) set.email = `patient-${id8(p._id)}@dev.local`;
    if (p.dateOfBirth instanceof Date) {
      // Same year, so ages and age-based reminders still behave.
      const n = seed(p._id);
      set.dateOfBirth = new Date(Date.UTC(p.dateOfBirth.getUTCFullYear(), n % 12, 1 + (n % 28)));
    }
    if (p.emergencyContact) {
      const contact = nameFor(seed(p._id) * 7 + 11);
      set['emergencyContact.name'] = `${contact.first} ${contact.last}`;
      set['emergencyContact.phone'] = fakePhone(p._id);
    }
    patientOps.push({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: set,
          $unset: {
            middleName: '', suffix: '', contacts: '', identifiers: '', 'socialHistory.notes': '',
            'discountEligibility.pwd.idNumber': '', 'discountEligibility.senior.idNumber': '',
            'discountEligibility.membership.membershipNumber': '',
            password: '', otp: '', otpExpiry: '', otpAttempts: '', loginQrTokenHash: '', loginQrTokenExpiry: '',
          },
        },
      },
    });
  }
  await bulk(db, 'patients', patientOps);
  for (const list of ['preExistingConditions', 'immunizations']) {
    await db.collection('patients').updateMany(
      { [`${list}.notes`]: { $exists: true } },
      { $set: { [`${list}.$[item].notes`]: REDACTED } },
      { arrayFilters: [{ 'item.notes': { $exists: true } }] }
    );
  }
  log(`  patients: ${patientOps.length}`);

  // 3. Users: <role><n>@<subdomain>.dev, known password, no 2FA or invite tokens.
  const roleNames = new Map<string, string>();
  for await (const r of db.collection('roles').find({}, { projection: { name: 1 } })) roleNames.set(String(r._id), String(r.name));
  const subdomains = new Map<string, string>();
  for await (const t of db.collection('tenants').find({}, { projection: { subdomain: 1 } })) subdomains.set(String(t._id), String(t.subdomain));

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const userInfo = new Map<string, { email: string; first: string; last: string }>();
  const profileOwner = new Map<string, { email: string; first: string; last: string }>();
  const oldEmails = new Map<string, string>();
  const counters = new Map<string, number>();
  const logins: DevLogin[] = [];
  const userOps: AnyBulkWriteOperation<Document>[] = [];
  const profileFields = PROFILES.map(([, field]) => field);
  const users = await db
    .collection('users')
    .find({}, { projection: { email: 1, role: 1, tenantId: 1, ...Object.fromEntries(profileFields.map((f) => [f, 1])) } })
    .sort({ tenantId: 1, _id: 1 })
    .toArray();
  for (const u of users) {
    const role = (roleNames.get(String(u.role)) ?? 'user').toLowerCase().replace(/[^a-z]/g, '') || 'user';
    const clinic = u.tenantId ? subdomains.get(String(u.tenantId)) ?? `tenant-${id8(u.tenantId)}` : 'platform';
    const key = `${clinic}:${role}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const email = `${role}${n}@${clinic}.dev`.toLowerCase();
    const { first, last } = fakeName(u._id);
    const info = { email, first, last };
    userInfo.set(String(u._id), info);
    if (u.email) oldEmails.set(String(u.email).toLowerCase(), email);
    for (const field of profileFields) if (u[field]) profileOwner.set(String(u[field]), info);
    logins.push({ email, role, clinic });
    userOps.push({
      updateOne: {
        filter: { _id: u._id },
        update: {
          $set: {
            email, name: `${first} ${last}`, password: passwordHash,
            mustSetPassword: false, status: 'active', isActive: true, totpEnabled: false, revokedSessions: [],
          },
          $unset: { totpSecret: '', totpPendingSecret: '', inviteTokenHash: '' },
        },
      },
    });
  }
  await bulk(db, 'users', userOps);
  log(`  users: ${userOps.length}`);

  // 4. Staff and medical-rep profiles: the linked User's identity, else a fake one.
  for (const [collection] of PROFILES) {
    const ops: AnyBulkWriteOperation<Document>[] = [];
    for await (const s of db.collection(collection).find({})) {
      const owner = profileOwner.get(String(s._id));
      const { first, last } = owner ?? fakeName(s._id);
      const set: Record<string, unknown> = {
        firstName: first,
        lastName: last,
        email: owner?.email ?? `${collection.replace(/s$/, '')}-${id8(s._id)}@dev.local`,
      };
      if (s.phone) set.phone = fakePhone(s._id);
      if (s.address) set.address = typeof s.address === 'string' ? `${DEV_ADDRESS.street}, ${DEV_ADDRESS.city}` : DEV_ADDRESS;
      if (s.emergencyContact) set.emergencyContact = { name: 'Dev Contact', phone: fakePhone(s._id), relationship: s.emergencyContact.relationship ?? '' };
      for (const f of ['licenseNumber', 'ptr', 'ptrNumber', 's2Number', 'philhealthPan', 'employeeId', 'certification']) {
        if (s[f]) set[f] = `DEV-${id8(s._id)}`;
      }
      if (s.bio) set.bio = '';
      if (Array.isArray(s.internalNotes)) set.internalNotes = [];
      if (s.company) set.company = 'Dev Pharma Inc.';
      ops.push({
        updateOne: {
          filter: { _id: s._id },
          update: { $set: set, $unset: { 'signature.image': '', profileImage: '', paymentReference: '' } },
        },
      });
    }
    await bulk(db, collection, ops);
    if (ops.length) log(`  ${collection}: ${ops.length}`);
  }

  // 5. Names copied onto other records.
  const queueOps: AnyBulkWriteOperation<Document>[] = [];
  for await (const q of db.collection('queues').find({}, { projection: { patient: 1 } })) {
    queueOps.push({ updateOne: { filter: { _id: q._id }, update: { $set: { patientName: patientNames.get(String(q.patient)) ?? 'Dev Patient' } } } });
  }
  await bulk(db, 'queues', queueOps);

  const invoiceOps: AnyBulkWriteOperation<Document>[] = [];
  for await (const inv of db.collection('invoices').find({ billedTo: { $exists: true } }, { projection: { patient: 1 } })) {
    invoiceOps.push({
      updateOne: {
        filter: { _id: inv._id },
        update: { $set: { 'billedTo.name': patientNames.get(String(inv.patient)) ?? 'Dev Patient', 'billedTo.address': DEV_ADDRESS } },
      },
    });
  }
  await bulk(db, 'invoices', invoiceOps);
  await db.collection('invoices').updateMany({ 'discounts.0': { $exists: true } }, { $unset: { 'discounts.$[].idNumber': '' } });
  await db.collection('invoices').updateMany({ 'paymentClaims.0': { $exists: true } }, { $set: { 'paymentClaims.$[].payerName': 'Dev Payer' } });
  await db.collection('invoices').updateMany({}, {
    $unset: { 'philhealth.pin': '', 'philhealth.memberName': '', 'insurance.policyNumber': '', 'insurance.memberId': '', payLinks: '' },
  });
  await db.collection('hmoclaimbatches').updateMany({ 'claims.0': { $exists: true } }, {
    $set: { 'claims.$[].patientName': 'Dev Patient' },
    $unset: { 'claims.$[].memberId': '', 'claims.$[].loaNumber': '' },
  });

  for (const [collection, userField] of [['visits', 'provider'], ['prescriptions', 'prescribedBy']] as const) {
    const ops: AnyBulkWriteOperation<Document>[] = [];
    for await (const d of db.collection(collection).find({ digitalSignature: { $exists: true } }, { projection: { [userField]: 1 } })) {
      const signer = userInfo.get(String(d[userField]));
      ops.push({
        updateOne: {
          filter: { _id: d._id },
          update: {
            $set: { 'digitalSignature.providerName': signer ? `Dr. ${signer.first} ${signer.last}` : 'Dr. Dev' },
            $unset: { 'digitalSignature.signatureData': '', 'digitalSignature.ipAddress': '' },
          },
        },
      });
    }
    await bulk(db, collection, ops);
  }
  log(`  queues: ${queueOps.length}, invoices: ${invoiceOps.length}`);

  // 6. Files: no links to production storage.
  for (const collection of ['visits', 'labresults', 'procedures', 'referrals', 'patientnotes']) {
    await db.collection(collection).updateMany({ 'attachments.0': { $exists: true } }, { $set: { attachments: [] } });
  }
  await db.collection('imagings').updateMany({ 'images.0': { $exists: true } }, { $set: { images: [] } });
  await db.collection('documents').updateMany({}, {
    $set: { url: `data:text/plain;base64,${Buffer.from('Removed in the local dev copy').toString('base64')}` },
    $unset: {
      thumbnailUrl: '', ocrText: '', 'metadata.cloudinaryPublicId': '', 'metadata.cloudinaryResourceType': '',
      'metadata.cloudinaryDeliveryType': '', 'metadata.cloudinaryFormat': '',
    },
  });

  // 7. Secrets and anything that calls out.
  await db.collection('paymentaccounts').updateMany({}, {
    $unset: { secretKeyEnc: '', webhookSecretEnc: '', publicKey: '', 'manual.number': '', 'manual.accountName': '', 'manual.qrImage': '' },
  });
  await db.collection('platformsettings').updateMany({}, { $unset: { secrets: '' } });
  await db.collection('webhookendpoints').updateMany({}, { $set: { enabled: false, url: 'https://example.invalid/hook' } });
  await db.collection('labresults').updateMany({}, { $unset: { 'thirdPartyLab.apiKey': '', 'thirdPartyLab.apiEndpoint': '' } });
  await db.collection('activationcodes').updateMany({}, { $unset: { codeEncrypted: '' } });
  await db.collection('visits').updateMany({ feedbackToken: { $exists: true } }, { $unset: { feedbackToken: '' } });
  await db.collection('appointments').updateMany({ 'teleconsult.roomName': { $exists: true } }, { $unset: { 'teleconsult.roomName': '' } });

  // 8. eMCR accounts, invites and access requests.
  const emcrOps: AnyBulkWriteOperation<Document>[] = [];
  for await (const a of db.collection('emcraccounts').find({}, { projection: { _id: 1 } })) {
    emcrOps.push({
      updateOne: {
        filter: { _id: a._id },
        update: { $set: { phone: `DEV${id8(a._id)}`, loginId: `DEV-${id8(a._id)}` }, $unset: { password: '', otp: '' } },
      },
    });
  }
  await bulk(db, 'emcraccounts', emcrOps);
  await db.collection('emcrinvites').updateMany({}, { $set: { phone: '09000000000' } });
  await db.collection('emcraccessrequests').updateMany({}, {
    $set: { firstName: 'Dev', lastName: 'Requester' },
    $unset: { contactPhone: '', contactEmail: '', note: '' },
  });

  // 9. Clinic contacts and outside parties. Clinic names and subdomains stay (routing needs them).
  const tenantOps: AnyBulkWriteOperation<Document>[] = [];
  for await (const t of db.collection('tenants').find({}, { projection: { email: 1, phone: 1 } })) {
    const set: Record<string, unknown> = {};
    if (t.email) set.email = `clinic-${id8(t._id)}@dev.local`;
    if (t.phone) set.phone = '09000000000';
    tenantOps.push({
      updateOne: {
        filter: { _id: t._id },
        update: { ...(Object.keys(set).length ? { $set: set } : {}), $unset: { 'billingProfile.tin': '' } },
      },
    });
  }
  await bulk(db, 'tenants', tenantOps);
  await overwriteWhereSet(db, 'tenants', 'billingProfile.email', 'billing@dev.local');
  await db.collection('tenants').updateMany({ 'subscription.paymentHistory.0': { $exists: true } }, {
    $unset: { 'subscription.paymentHistory.$[].payerEmail': '' },
  });
  await db.collection('settings').updateMany({}, {
    $set: { 'communicationSettings.smsEnabled': false, 'communicationSettings.emailEnabled': false },
  });
  await overwriteWhereSet(db, 'settings', 'clinicEmail', 'clinic@dev.local');
  await overwriteWhereSet(db, 'settings', 'clinicPhone', '09000000000');
  for (const [field, value] of [['email', 'hmo@dev.local'], ['phone', '09000000000'], ['contactName', 'Dev Contact']]) {
    await overwriteWhereSet(db, 'hmos', field, value);
  }
  await db.collection('referrals').updateMany({ referringContact: { $exists: true } }, { $unset: { referringContact: '' } });
  await db.collection('platforminvoices').updateMany({}, { $unset: { 'buyer.email': '', 'buyer.tin': '', 'buyer.phone': '' } });
  await overwriteWhereSet(db, 'supportrequests', 'email', 'support-requester@dev.local');
  await overwriteWhereSet(db, 'supportrequests', 'message', REDACTED);
  await db.collection('supportrequests').updateMany({ 'replies.0': { $exists: true } }, {
    $set: { 'replies.$[].authorEmail': 'support@dev.local', 'replies.$[].message': REDACTED },
  });

  // 10. Logs and messages.
  const auditOps: AnyBulkWriteOperation<Document>[] = [...oldEmails].map(([oldEmail, email]) => ({
    updateMany: { filter: { userEmail: oldEmail }, update: { $set: { userEmail: email } } },
  }));
  await bulk(db, 'auditlogs', auditOps);
  const devEmails = [...oldEmails.values()];
  await db.collection('auditlogs').updateMany(
    { userEmail: { $exists: true, $nin: devEmails } },
    { $set: { userEmail: 'someone@dev.local' } }
  );
  // Descriptions can name a patient and query strings can carry a phone or email; keep what
  // happened to what, and the path without its query.
  await db.collection('auditlogs').updateMany({}, [
    {
      $set: {
        description: { $concat: [{ $ifNull: ['$action', ''] }, ' ', { $ifNull: ['$resource', ''] }] },
        requestPath: { $arrayElemAt: [{ $split: [{ $ifNull: ['$requestPath', ''] }, '?'] }, 0] },
      },
    },
    { $unset: ['ipAddress', 'userAgent', 'changes', 'metadata'] },
  ]);
  await db.collection('documentseals').updateMany({}, { $set: { issuedByName: 'Dev Staff' }, $unset: { ipAddress: '', userAgent: '' } });
  await db.collection('surveys').updateMany({}, { $unset: { ipAddress: '' } });
  await overwriteWhereSet(db, 'surveys', 'comments', REDACTED);
  await overwriteWhereSet(db, 'messages', 'body', REDACTED);
  await overwriteWhereSet(db, 'conversations', 'lastMessage.body', REDACTED);
  await db.collection('patientmessages').updateMany({}, { $set: { title: REDACTED, message: REDACTED, 'sender.name': 'Dev Clinic' } });
  for (const [collection, field] of [
    ['webhookendpoints', 'createdByEmail'], ['platformannouncements', 'sentByEmail'], ['voucherbatches', 'receivedBy'],
    ['voucherbatches', 'createdBy'], ['inventorymovements', 'performedByName'], ['patientnotes', 'author.name'],
  ]) {
    await overwriteWhereSet(db, collection, field, field.toLowerCase().includes('email') ? 'staff@dev.local' : 'Dev Staff');
  }
  await overwriteWhereSet(db, 'platformsettings', 'updatedBy', 'staff@dev.local');
  await db.collection('prescriptions').updateMany({ 'pharmacyDispenses.0': { $exists: true } }, {
    $set: { 'pharmacyDispenses.$[].dispensedBy': 'staff@dev.local' },
  });
  await db.collection('emcraccounts').updateMany({ 'activationHistory.0': { $exists: true } }, {
    $set: { 'activationHistory.$[].by': 'staff@dev.local' },
  });

  return { logins, problems: await selfCheck(db) };
}

/** Anything still looking like real data or a live secret. Empty means clean. */
async function selfCheck(db: Db): Promise<string[]> {
  const checks: [string, string, Document][] = [
    ['users', 'email not dev', { email: { $not: /\.dev$/ } }],
    ['users', 'TOTP secret', { totpSecret: { $exists: true } }],
    ['patients', 'email not dev', { email: { $exists: true, $nin: [null, ''], $not: /@dev\.local$/ } }],
    ['patients', 'identifiers or contacts', { $or: [{ identifiers: { $exists: true } }, { contacts: { $exists: true } }] }],
    ['patients', 'attachments', { 'attachments.0': { $exists: true } }],
    ...PROFILES.map(([c]) => [c, 'email not dev', { email: { $not: /(@dev\.local|\.dev)$/ } }] as [string, string, Document]),
    ['paymentaccounts', 'payment secrets', { $or: [{ secretKeyEnc: { $exists: true } }, { webhookSecretEnc: { $exists: true } }] }],
    ['platformsettings', 'secrets', { secrets: { $exists: true } }],
    ['webhookendpoints', 'enabled endpoint', { enabled: true }],
    ['visits', 'attachments', { 'attachments.0': { $exists: true } }],
    ['documents', 'Cloudinary link', { 'metadata.cloudinaryPublicId': { $exists: true } }],
    ['auditlogs', 'IP address', { ipAddress: { $exists: true } }],
    ['emcraccounts', 'phone not dev', { phone: { $exists: true, $not: /^DEV/ } }],
  ];
  const problems: string[] = await scanForRealContacts(db);
  for (const [collection, label, filter] of checks) {
    const n = await db.collection(collection).countDocuments(filter);
    if (n) problems.push(`${collection}: ${n} with ${label}`);
  }
  for (const name of EMPTY) {
    const n = await db.collection(name).countDocuments();
    if (n) problems.push(`${name}: ${n} documents (should be empty)`);
  }
  return problems;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Not inside a longer token (an ObjectId in a URL can contain a digit run that looks like a number).
const MOBILE = /(?<![0-9A-Za-z])(?:\+?63|0)9\d{9}(?![0-9A-Za-z])/g;
const isDevEmail = (e: string) => /(@dev\.local|\.dev|@example\.invalid)$/i.test(e);
const isDevPhone = (p: string) => /^(?:\+?63|0)900/.test(p);

/**
 * Every string in every collection, searched for an email, a PH mobile number or a Cloudinary
 * link that isn't one of the scrub's own. Catches fields the steps above don't know about.
 */
async function scanForRealContacts(db: Db): Promise<string[]> {
  const found = new Map<string, number>();
  const note = (key: string) => found.set(key, (found.get(key) ?? 0) + 1);
  const walk = (value: unknown, path: string, collection: string) => {
    if (typeof value === 'string') {
      if ((value.match(EMAIL) ?? []).some((e) => !isDevEmail(e))) note(`${collection}.${path}: email`);
      if ((value.match(MOBILE) ?? []).some((p) => !isDevPhone(p))) note(`${collection}.${path}: phone number`);
      if (value.includes('res.cloudinary.com')) note(`${collection}.${path}: Cloudinary link`);
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, `${path}[]`, collection);
    } else if (value && typeof value === 'object' && !(value instanceof Date) && !('_bsontype' in value)) {
      for (const [key, item] of Object.entries(value)) walk(item, path ? `${path}.${key}` : key, collection);
    }
  };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    for await (const doc of db.collection(name).find({})) walk(doc, '', name);
  }
  return [...found].map(([where, n]) => `${where} in ${n} document field(s)`);
}
