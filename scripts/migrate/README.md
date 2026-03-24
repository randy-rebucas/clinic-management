# MySQL → MongoDB Migration Guide

Scripts for migrating clinic data from a GoDaddy-hosted MySQL/phpMyAdmin database
to this MongoDB-based MyClinicSoft project.

---

## Prerequisites

1. **Install dependencies** (if not done already):
   ```bash
   npm install
   ```
   `csv-parse` is already added as a dev dependency.

2. **Ensure `.env.local` has `MONGODB_URI`** pointing to your target MongoDB database.

3. **Export CSVs from phpMyAdmin** and place them in the `exports/` directory.
   See [exports/README.md](../../exports/README.md) for the required file names and columns.

---

## Quick Start — Run All at Once

```bash
npm run migrate
```

This runs all 10 scripts in dependency order and pauses on each failure.

After completion, validate the counts:

```bash
npm run migrate:validate
```

---

## Run Scripts Individually

If you want to run scripts one at a time (recommended for large datasets or debugging):

```bash
npm run migrate:01-specializations
npm run migrate:02-doctors
npm run migrate:03-patients
npm run migrate:04-appointments
npm run migrate:05-invoices
npm run migrate:06-medicines
npm run migrate:07-inventory
npm run migrate:08-staff
npm run migrate:09-prescriptions
npm run migrate:10-lab-results
```

**You must run them in order** — later scripts depend on the ID maps saved by earlier ones.

---

## Dependency Order

```
specializations  ──┐
                   ├──▶ doctors ──┐
                                  ├──▶ appointments ──┐
                   patients ──────┤                   ├──▶ prescriptions
                                  │                   ├──▶ lab_results
                                  └──▶ invoices       │
medicines ─────────────────────────────────────────┘
inventory    (independent)
staff        (independent)
```

---

## CSV Column Mapping Reference

### patients.csv
| MySQL column | MongoDB field |
|---|---|
| `first_name` | `firstName` |
| `last_name` | `lastName` |
| `middle_name` | `middleName` |
| `date_of_birth` | `dateOfBirth` |
| `sex` | `sex` (male/female/other) |
| `phone` | `phone` |
| `email` | `email` |
| `address_street` | `address.street` |
| `address_city` | `address.city` |
| `address_state` | `address.state` |
| `address_zip` | `address.zipCode` |
| `philhealth` | `identifiers.philHealth` |
| `gov_id` | `identifiers.govId` |
| `allergies` | `allergies` (comma-separated) |
| `emergency_contact_name` | `emergencyContact.name` |
| `emergency_contact_phone` | `emergencyContact.phone` |
| `emergency_contact_relationship` | `emergencyContact.relationship` |

> **Tip:** If your MySQL columns have different names, edit the mapping in the relevant script file.

### appointments.csv
| MySQL column | MongoDB field |
|---|---|
| `patient_id` | `patient` (resolved via id-map) |
| `doctor_id` | `doctor` (resolved via id-map) |
| `appointment_date` | `appointmentDate` |
| `appointment_time` | `appointmentTime` (HH:mm) |
| `duration` | `duration` (minutes) |
| `status` | `status` |
| `reason` | `reason` |
| `is_walk_in` | `isWalkIn` (0/1) |
| `room` | `room` |

### staff.csv
| MySQL `role` value | Migrated to |
|---|---|
| `admin` | `Admin` model |
| `receptionist` | `Receptionist` model |
| `nurse` | `Nurse` model |
| `accountant` | `Accountant` model |
| `doctor` | **Skipped** (use 02-doctors.ts) |
| anything else | `Staff` model |

> **All migrated staff get a temporary password: `ChangeMe123!`**
> Remind each user to change it on first login.

---

## Re-running Scripts

All scripts use **upsert** logic (find-or-insert based on unique fields like `email`, `invoiceNumber`, `name+phone`). It is safe to re-run scripts without creating duplicates.

---

## ID Maps

Each script saves a JSON file to `exports/id-maps/` mapping old MySQL integer IDs to new MongoDB ObjectIds:

```
exports/id-maps/
  patients.json
  doctors.json
  appointments.json
  ...
```

These are read by dependent scripts. Do not delete them until migration is complete.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `CSV file not found` | Ensure the file is in `exports/` with the exact name shown |
| `Could not resolve foreign key` | Run the dependency script first (e.g., run `03-patients` before `04-appointments`) |
| `Duplicate key error` | Safe to ignore — record already imported (upsert) |
| `MONGODB_URI is not defined` | Add it to `.env.local` |
| Missing columns in CSV | Edit the field mapping in the relevant script to match your column names |
