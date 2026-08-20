# Migration Notes — Mongoose → Prisma/PostgreSQL (Phase 1)

This document lists every judgment call made while translating `models/*.ts`
(39 Mongoose models) into `prisma/schema.prisma`. Review before Phase 2
(data migration scripts) — several of these affect data integrity or
require app-layer enforcement that Postgres/Prisma won't do for you.

Output: **69 Prisma models** (39 "primary" models matching the Mongoose
files + 30 child/junction tables introduced to replace embedded
arrays/subdocs with real relations), plus ~90 enums.

---

## Top-priority items for human review

1. **`Patient.patientCode` uniqueness scope changed.** In Mongoose it was
   a sparse unique index on `{ tenantIds: 1, patientCode: 1 }`. Since
   `Patient.tenantIds` is now a many-to-many relation (`PatientTenant`
   junction table) rather than a column on `Patient`, there is no single
   `tenantId` column to compound the unique constraint against. I made
   `patientCode` **globally unique** (`@@unique([patientCode])`) instead.
   If two different tenants each want to reuse the same code, this will now
   collide. If that matters, either (a) keep patient codes globally unique
   by convention going forward, or (b) move `patientCode` uniqueness
   enforcement into the application layer, scoped by joining through
   `PatientTenant`.

2. **`Document`'s "at most one polymorphic parent" rule is unenforced in
   the DB.** `Document` has six nullable FKs (`patientId`, `visitId`,
   `appointmentId`, `labResultId`, `invoiceId`, and `prescriptionId` — see
   note 3 below) with no CHECK constraint. Prisma schema can't express
   partial/conditional constraints portably; enforce "at most one set" in
   the application/repository layer (e.g. a Zod refinement or a Postgres
   CHECK constraint added via a raw migration in Phase 2).

3. **`Document.prescriptionId` was added beyond the spec's 5-field list.**
   The task description named `patient/visit/appointment/labResult/invoice`
   as Document's polymorphic refs, but the actual `models/Document.ts`
   doesn't reference `Prescription` at all — I misread an adjacent
   `category: 'prescription'` enum value as implying a relation. **Correction:
   there is no `prescription` ref field in the Mongoose `IDocument` interface.**
   I left `prescriptionId`/`prescription` in the schema as a defensible
   forward-compatible addition (documents *are* tagged with a `prescription`
   category), but flag it for removal if it's not wanted — it has no Mongoose
   source of truth. Double-check before Phase 2 data migration since there's
   no source column to populate it from.

4. **Multi-tenant "array of Tenant refs" pattern applied to
   `MedicalRepresentative` as well, not just `Patient`.** The task only
   explicitly called out `Patient.tenantIds`, but `MedicalRepresentative.tenantIds`
   in `models/MedicalRepresentative.ts` has the identical shape (array of
   Tenant ObjectId refs). I applied the same junction-table pattern
   (`MedicalRepresentativeTenant`) for consistency. If Phase 2 expected
   `MedicalRepresentative` to keep a single `tenantId` column, this needs
   to be revisited — it's currently un-scoped by tenant entirely (no
   `tenantId` column on `MedicalRepresentative` at all).

5. **Large boolean "settings" blocks flattened to ~50 individual columns**
   (`Settings.automationSettings`, `appointmentSettings`, etc.). This
   matches the "flatten fixed-shape 1:1 embeds" rule, but it does produce a
   very wide `Settings` table. An alternative would have been a single
   `Json` column per settings sub-object (`automationSettings Json`) since
   these are pure config flags rarely queried individually. I chose columns
   per the instructions' preference for flattening fixed shapes, but this
   is a case where `Json` might be more maintainable long-term — reconsider
   if the settings shape churns frequently (each new automation flag
   currently requires a migration).

---

## Attachment (shared embedded subdocument)

`Attachment` (`models/Attachment.ts`) is used as an embedded subdocument on
five different parents: `Patient.attachments`, `Visit.attachments`,
`LabResult.attachments`, `Imaging.images`, and `Procedure.attachments`. It
is never queried as a standalone collection in the app (no `Attachment.find()`
calls exist independent of a parent).

**Decision:** created one child table per parent (`PatientAttachment`,
`VisitAttachment`, `LabResultAttachment`, `ImagingAttachment`,
`ProcedureAttachment`) rather than a single shared `Attachment` table with a
polymorphic parent FK. This keeps each relation a real, non-polymorphic FK
(consistent with the Document polymorphism note above, which explicitly
avoids polymorphic modeling elsewhere). The tradeoff is schema duplication
(5 near-identical tables) instead of one shared table + `attachableType`
discriminator column. Reconsider if attachment-level features (e.g. a
single "all attachments" admin view) become important — a shared table
with 5 nullable polymorphic FKs (same pattern as `Document`) would serve
that better at the cost of losing strict non-null parent FKs.

## Role / Permission

- `Role.defaultPermissions` (array of `{resource, actions[]}`) → child table
  `RoleDefaultPermission`, since it's independently meaningful structured
  data, not a primitive list.
- `Role.permissions` (array of Permission refs) and the reverse direction
  are modeled as a genuine Prisma implicit many-to-many
  (`Role.permissions Permission[] @relation("RolePermissions")` /
  `Permission.roles Role[] @relation("RolePermissions")`), per the "Role ↔
  Permission many-to-many" instruction.
- `Permission` also has a *separate* single `userId` FK (permissions
  assigned directly to a user, not via a role) — this is unrelated to the
  Role↔Permission M2M and preserved as its own nullable relation.
- Mongoose's `pre('validate')` XOR constraint ("either user or role, not
  both, not neither") on `Permission` is **not enforced in the DB** — no
  such constraint exists in the Prisma schema. Enforce at the application
  layer (Phase 2 repository/service layer).

## Profile models (Admin/Doctor/Nurse/Receptionist/Accountant/MedicalRepresentative)

- `internalNotes[]` on each → its own child table
  (`AdminInternalNote`, `DoctorInternalNote`, etc.) rather than one shared
  table, matching the Attachment decision above (never queried across
  parent types).
- `schedule[]` / `availabilityOverrides[]` on each → own child tables per
  parent (same reasoning).
- `performanceMetrics` (fixed-shape single embedded object per profile) →
  flattened to columns, prefixed `perf*`.
- `emergencyContact` (fixed-shape single embedded object) → flattened.
- The Mongoose `post('save')` hooks that auto-create a linked `User` on
  Admin/Doctor/Nurse/Receptionist/Accountant/MedicalRepresentative save are
  **application/service-layer logic**, not schema — they have no Prisma
  equivalent and must be reimplemented as explicit service calls (or DB
  triggers, not recommended) in Phase 2.

## User

- Six "one-of" profile refs (`adminProfile`, `doctorProfile`, `nurseProfile`,
  `receptionistProfile`, `accountantProfile`, `medicalRepresentativeProfile`)
  → nullable **unique** FK columns per the instructions, each a real 1:1
  Prisma relation. The Mongoose `pre('save')` validation ("cannot have
  multiple profile types set simultaneously", "profile must match role
  name") is **not enforced in Postgres** — reimplement in the app/service
  layer (Phase 2).
- `totpSecret` and (on `Patient`) `password`/`otp` used Mongoose's
  `select: false` to exclude them from default query results. Prisma has
  no field-level default-exclusion — **every read of `User`/`Patient` will
  include these columns unless the calling code explicitly `select`s around
  them.** This needs a repository-layer convention (e.g. a `lib/data/users.ts`
  helper with a `SAFE_USER_SELECT` constant) before Phase 2 ships, or
  secrets will leak into API responses that previously relied on Mongoose's
  default exclusion.
- Legacy `staffInfo` ref kept (deprecated in Mongoose comments, but still an
  active field) — preserved as-is for backward compatibility, not removed.

## Specialization

Straightforward 1:many `Doctor.specializationId → Specialization`, globally
unique `name`. No embedded structures.

## Patient

- `tenantIds` → `PatientTenant` junction table, per the given instruction.
- `allergies: Array<string | {substance, reaction, severity}>` (Mongoose
  `Mixed` type) → its own child table `PatientAllergy` with a `rawText`
  column to hold the plain-string form and separate `substance`/`reaction`/
  `severity` columns for the structured form, all nullable. A migration
  script (Phase 2) will need to inspect each Mongoose value's `typeof` and
  route it to the right columns. Chosen per the task's suggestion
  ("probably its own child table since it's clinically important data").
- `identifiers.other` (`Map<string,string>`, genuinely dynamic keys) → `Json`.
  `identifiers.philHealth`/`identifiers.govId` (fixed keys) → flattened
  columns.
- `familyHistory` (`Map<string,string>`, dynamic keys like `{diabetes:
  'father'}`) → `Json`.
- `discountEligibility` (fixed-shape nested struct: `pwd`/`senior`/
  `membership` sub-objects) → flattened to columns with prefixes
  (`pwd*`, `senior*`, `membershipDisc*`). Chose "membershipDisc" prefix
  (not just "membership") to avoid confusion with the separate `Membership`
  model/relation on `Patient`.
- `readNotificationIds: string[]` and `tags: string[]` → native Postgres
  `String[]` arrays (small primitive lists).
- Mongoose's virtual `fullName` getter has no Prisma equivalent — compute
  it in application code (Prisma has no computed/virtual columns without a
  raw SQL generated column, not used here).

## PatientNote

`author` is a denormalized snapshot (`userId`, `name`, `role` captured at
write time, not a live-updating FK join) — kept as flattened columns
(`authorUserId` stored as plain string, not a Prisma relation) to preserve
that Mongoose behavior exactly: the note keeps the author's name/role as
they were *at the time*, even if the user's name changes later.
`attachments[]` (small fixed-shape struct, url/name/type/uploadedAt) → own
child table `PatientNoteAttachment` since it's a list of structured records
tied 1:many to the note (not just a primitive array).

## Room / Service / Medicine / Product / Inventory

- `Room.schedule[]` / `availabilityOverrides[]` → child tables, same pattern
  as staff profiles.
- `Medicine.dosageRanges[]` → child table `MedicineDosageRange` (structured,
  independently meaningful). `indications`/`contraindications`/`sideEffects`/
  `brandNames` → native string arrays (simple primitive lists).
- `InventoryItem`'s Mongoose `pre('save')` (auto-derive `status` from
  `quantity`/`expiryDate`) and `post('save')` (fire low-stock alert) hooks
  are business logic with no schema equivalent — reimplement as
  application-layer logic (a service function called on every inventory
  write) in Phase 2.

## Queue / Appointment

- `Queue.vitals` (Mongoose `Mixed` but with a documented fixed shape
  matching `Visit.vitals`) → flattened columns, treated as fixed-shape
  despite the loose Mongoose typing, for consistency with `Visit.vitals`
  (which uses a real sub-schema). If in practice arbitrary extra vitals
  keys were ever stored (relying on `Mixed`'s looseness), those would be
  **dropped** by this flattening — worth auditing real production data
  before Phase 2 migration.
- `Appointment.queueId` kept as a plain informational `String` column (no
  Prisma relation declared) to avoid an ambiguous bidirectional relation
  with `Queue.appointmentId` (Queue already has the "real" FK back to
  Appointment; `Appointment.queueId` in Mongoose was somewhat redundant/
  legacy). If this field is actually read anywhere in the app, reinstate it
  as a proper relation and pick one direction as canonical.
- Both `Appointment` (`appointmentDate`+`appointmentTime` vs `scheduledAt`)
  and its Mongoose virtuals (`computedScheduledAt`, `computedDate`,
  `computedTime`) — the dual-format scheduling fields are preserved as-is
  (all nullable, per the original "either format" validation), but the
  virtuals have no Prisma equivalent; recompute in application code.

## Visit

- Per the given instruction, dropped `Visit.prescriptions` / `labsOrdered`
  / `imagingOrdered` / `proceduresPerformed` array-of-refs fields; these are
  now reverse relations driven by the child models' own `visitId` FK.
- `treatmentPlan.medications[]` / `.procedures[]` / `.lifestyle[]` →
  own child tables (`VisitTreatmentMedication`, `VisitTreatmentProcedure`,
  `VisitTreatmentLifestyle`) since they're independently meaningful
  structured lists, not primitive arrays.
- `treatmentPlan.followUp` (single embedded object) → flattened columns.
- `digitalSignature` — Mongoose enforces "if any required field is set, all
  required fields must be set" via a custom `pre('validate')` hook. Rather
  than flattening to nullable columns on `Visit` (which would lose the
  all-or-nothing semantics entirely), I gave it its own 1:1 child table
  (`VisitDigitalSignature`) where a *row's existence* represents "signature
  present." This is a deliberate deviation from "flatten fixed-shape 1:1
  embeds" because of that validation coupling — reconsider if simpler
  flattened columns are preferred and the all-or-nothing rule is
  re-enforced purely in the app layer instead.
- `vitals` / `physicalExam` → flattened (fixed shape, Mongoose sub-schemas
  with `_id: false`, never queried independently).

## Prescription

- `medications[]` → child table `PrescriptionMedication` (structured,
  clinically important, matches the `Patient.allergies` reasoning).
- `pharmacyDispenses[]` → child table `PrescriptionPharmacyDispense`
  (multiple dispense events over time, genuinely 1:many).
- `copies.patientCopy` / `copies.clinicCopy` — both are fixed-shape 1:1
  embeds, but each contains a `User` FK (`printedBy`/`archivedBy`) that
  needs a real relation. Rather than flattening onto `Prescription`
  directly (which would work fine and was my first instinct), I gave each
  its own 1:1 child table (`PrescriptionPatientCopy`, `PrescriptionClinicCopy`)
  purely to keep the two distinct `User` relations from cluttering the main
  `Prescription` model with 6+ prefixed columns each. **This is arguably
  over-normalization** — flattening `copies.patientCopy.*` /
  `copies.clinicCopy.*` directly onto `Prescription` (like `Invoice.insurance`
  was flattened) would have been equally valid and simpler. Reconsider
  collapsing these two tables back into `Prescription` columns if the
  extra joins are undesirable.
- `digitalSignature` (fixed shape, no `User` FK — just a `providerName`
  text snapshot) → flattened columns, unlike `Visit.digitalSignature` which
  got its own table because it *does* have a `User` FK and an all-or-
  nothing validation rule. Inconsistent-looking but intentional given the
  different shapes.
- `drugInteractions[]` → child table (structured, independently meaningful
  audit-style records).

## LabResult / Imaging / Procedure

- `LabResult.request` (required fixed-shape 1:1 embed) → flattened columns
  prefixed `request*`.
- `LabResult.thirdPartyLab` (optional fixed-shape 1:1 embed) → flattened
  columns prefixed `thirdParty*`. Note: `thirdPartyApiKey` was stored in
  plaintext in the original Mongoose schema (comment says "Encrypted in
  production" but the field type is a plain `String`) — flagged here as a
  **pre-existing security gap**, not something this migration introduces
  or fixes. Consider using `lib/encryption.ts` (per project MEMORY.md) on
  this column in Phase 2.
- `LabResult.results` / `referenceRanges` (Mongoose `Mixed`, genuinely
  dynamic lab-panel-shaped data, e.g. `{hb: 13.2, wbc: 6.5}`) → `Json`.
- `LabResult.abnormalFlags` (`Map<string, 'high'|'low'|'normal'>`) → `Json`
  (dynamic keys; the value enum itself isn't enforceable through Json, so
  validate in the app layer).
- `Imaging`/`Procedure` are straightforward — attachments got their own
  child tables per the shared Attachment decision above.

## Invoice

- `items[]` (`BillingItem[]`) → `InvoiceLineItem` child table, per the
  given instruction.
- `discounts[]` → child table `InvoiceDiscount`. The Mongoose schema allows
  multiple discounts to be applied to one invoice (e.g. senior + membership
  stacked), so this must be 1:many, not flattened.
- `payments[]` → `InvoicePayment` child table, per the given instruction
  (Mongoose schema clearly supports multiple partial payments over time —
  no upper bound, each with its own `date`/`method`/`processedBy`).
- `insurance` (fixed-shape, optional 1:1 embed, no independent FK inside
  it beyond text fields) → flattened columns, per the general flattening
  rule.
- `professionalFeeType` was a Mongoose `enum` field — converted to a native
  Prisma enum (`InvoiceProfessionalFeeType`) rather than leaving it a plain
  string, consistent with the "fixed small value-set → enum" rule.

## Referral

- `referringContact` (fixed-shape 1:1 embed) → flattened.
- `attachments[]` (simple `{filename, url, uploadDate}` structured list) →
  child table `ReferralAttachment`.
- `feedback` (fixed-shape optional 1:1 embed with a `User` FK) → flattened
  onto `Referral` directly (unlike the analogous `Prescription.copies.*`
  case) since it's a single small object with only one FK — kept simple.
- `urgency` reuses the `LabUrgency` enum (`routine`/`urgent`/`stat`),
  shared with `LabResult.request.urgency`, per the "reuse enums where
  semantics match" guidance — both represent the same routine/urgent/stat
  triage concept.
- Mongoose's `pre('save')` referral-code auto-generation
  (`REF-${Date.now()}-${count}`) is app logic, not schema; reimplement as a
  service-layer default generator in Phase 2 (Prisma's `@default(uuid())`
  covers the `id` PK but not this human-readable code).

## Membership

- `transactions[]` → `MembershipTransaction` child table, per the given
  instruction.
- `referredBy` / `referrals` — the task said this self-relation lives "on
  Patient or Membership, whichever the Mongoose schema actually has it
  on." **Checked: it's on `Membership`, not `Patient`** —
  `Membership.referredBy: Types.ObjectId` (ref `Patient`) and
  `Membership.referrals: Types.ObjectId[]` (ref `Patient`, the inverse).
  Modeled `referredById` as a genuine FK on `Membership` pointing at
  `Patient` (not a self-relation on `Patient`, since `Membership` and
  `Patient` are different models — this is a cross-model relation, not a
  true self-relation despite what the task text implied). The inverse
  `referrals[]` array is **not** materialized as a stored column; it's
  queryable via `Patient.memberReferralsMade` (patients whose membership's
  `referredById` points at this patient). This assumes `referrals` was
  always meant to be a derived/computed list in the app, which matches how
  Mongoose would need to populate it (a reverse lookup, not a stored array
  in practice, since storing both directions would require dual writes).
- `TransactionSchema.relatedEntity.id` is polymorphic (visit/appointment/
  invoice) — kept as a plain `String @db.Uuid` column with no FK relation
  (same reasoning as `Notification.relatedEntity`), since a single column
  can't cleanly FK to three different tables without the nullable-multi-FK
  pattern used for `Document`. If per-type integrity matters, revisit using
  the `Document`-style nullable-multi-FK pattern instead.

## Document

See top-priority items 2 and 3 above (unenforced "at most one parent" rule,
and the extra `prescriptionId` field not present in the Mongoose source).
`metadata` (`{[key:string]: any}`) → `Json`, genuinely dynamic (comment
mentions `cloudinaryPublicId` as an example key, implying more keys exist
elsewhere in the app that aren't in the Mongoose type).

## Notification

`relatedEntity.id` — same polymorphic-single-column treatment as
`Membership.transactions[].relatedEntity`, no FK relation (see above).
`metadata` → `Json` (dynamic).

## PushSubscription

Straightforward. `keys` (fixed 2-field embed: `p256dh`/`auth`) → flattened.
Global `endpoint` unique constraint preserved exactly as in Mongoose.

## AuditLog

- `changes[]` → child table `AuditLogChange`, since it's a genuinely
  variable-length list of field-level diffs (`oldValue`/`newValue` are
  `Mixed` → `Json` on the child rows).
- `metadata` → `Json` (dynamic).
- `dataSubject` (optional FK to `Patient`, for PH Data Privacy Act
  compliance tracking) required adding a back-relation
  (`Patient.auditLogsAsDataSubject`) not explicitly called out in the task
  instructions but necessary for Prisma schema validity (every relation
  needs both sides declared).
- The commented-out 7-year TTL index in the Mongoose source
  (`expireAfterSeconds: 220752000`) has no direct Prisma/Postgres
  equivalent — TTL-style expiry in Postgres would need a scheduled job
  (e.g. a cron route, matching the project's existing `/app/api/cron/*`
  pattern) rather than a native expiring index. Not implemented here since
  it was commented out in the source too.

## SupportRequest / BackupRecord / PaypalOrder / Survey / Settings / MedicalRepresentativeVisit

- `BackupRecord.data: Record<string, unknown[]>` → `Json`, inherently a
  dynamic dump of arbitrary collection contents (this is *the* canonical
  case for `Json` — it's explicitly meant to hold arbitrary shapes across
  different backup runs).
- `PaypalOrder`'s Mongoose TTL index (`expireAfterSeconds: 7200` on
  pending orders only, via `partialFilterExpression`) has no Postgres
  equivalent either — same note as AuditLog's TTL index above. Needs a
  cron job in Phase 2 to delete abandoned pending orders older than 2
  hours.
- `SurveyResponse` (renamed from Mongoose's `Survey` model name / `ISurveyResponse`
  interface — I used `SurveyResponse` as the Prisma model name since that's
  what the actual TS interface calls it, even though the Mongoose model
  export and collection are literally named `Survey`). **Flag: if Phase 2
  tooling expects the Prisma model to be named `Survey` to match the
  Mongoose collection name for a mechanical migration script, rename
  `SurveyResponse` → `Survey`.**
- `Settings.businessHours[]` → child table `SettingsBusinessHours` (7-row
  list, structured, day-of-week enum). All the large fixed-shape settings
  sub-objects (`appointmentSettings`, `communicationSettings`,
  `billingSettings`, `queueSettings`, `generalSettings`,
  `integrationSettings`, `automationSettings`, `displaySettings`) →
  flattened to prefixed columns — see top-priority item 5 for the
  Json-vs-columns tradeoff discussion.
- `MedicalRepresentativeVisit` — straightforward, no embedded structures.

## Enum reuse summary

- `StaffStatus` (`active`/`inactive`/`on-leave`) shared across
  Admin/Doctor/Nurse/Receptionist/Accountant/MedicalRepresentative — all
  five profile models use the identical value set in Mongoose.
- `RecordStatus` (`active`/`inactive`/`suspended`) shared across
  `Tenant`... actually `Tenant` has its own `TenantStatus` (kept separate
  since Tenant's status semantics — suspension for billing reasons — are
  distinct enough to warrant not conflating with `User`/`Admin` status).
  `RecordStatus` is used by `User.status` and `Admin.status`.
- `LabUrgency` shared between `LabResult.request.urgency` and
  `Referral.urgency` (see Referral section above).
- Enums that looked similar but were **kept separate** because their value
  sets or semantics actually differ: `QueueStatus` vs `AppointmentStatus`
  vs `VisitStatus` vs `ReferralStatus` vs `MembershipStatus` — all have
  different member sets (e.g. only `Appointment` has `rescheduled`; only
  `Queue` has `no-show` alongside `Appointment`, but with a different
  full set) — merging them would have silently allowed invalid states.

## Fields with Mongoose `select: false` (app-layer exclusion required)

Prisma has no per-field default-exclusion. The following columns were
`select: false` in Mongoose and **will be returned by default** in any
Prisma query unless the calling code explicitly omits them:

- `User.totpSecret`
- `Patient.password`
- `Patient.otp`

**Action required before Phase 2 ships:** build a `lib/data/*.ts`
repository layer (per project conventions in MEMORY.md) with explicit
`select` clauses that omit these fields by default, and only include them
in the specific auth/2FA code paths that need them.
