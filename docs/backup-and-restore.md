# Database Backup & Restore

This document covers the full backup and restore system available in the clinic management platform — both the in-app admin UI and the CLI scripts for local/automated use.

---

## Overview

Backups capture a complete snapshot of every MongoDB collection (excluding system collections and the backup history itself). They can be triggered from the Admin UI or from the command line. Backup records are stored in the `backuprecords` MongoDB collection and can also be exported as `.json` files to local disk.

All backup and restore actions are recorded in the audit log.

---

## Admin UI

### Access

Navigate to **Admin → Backups** (`/admin/backups`). Only users with the `admin` or `owner` role can access this page.

### Create a Backup

1. Optionally enter a label (e.g. `pre-migration`, `before-upgrade`).
2. Click **Create Backup**.
3. The backup is saved to the database. The list refreshes automatically.

### Download a Backup

Click **Download** on any completed backup. The browser will download a `.json` file named:

```
backup-<label>-<timestamp>.json
```

Keep this file somewhere safe — it can be used with the CLI restore script or re-uploaded via the API.

### Restore from a Stored Backup

> **Warning:** Restoring overwrites all current data. Create a fresh backup first.

1. Click **Restore** on the backup you want to apply.
2. Confirm the dialog — it shows the backup label and timestamp.
3. Click **Yes, Restore**. A per-collection result table is shown on completion.

The `backuprecords` collection is never wiped during a restore, so backup history is always preserved.

### Delete a Backup

Click **Delete** on a backup record. A confirmation dialog appears. Once deleted, the backup data is permanently removed.

---

## CLI Scripts

Use these scripts for automated backups, scheduled jobs, or when the server is not running.

Both scripts read credentials from `.env.local` (then `.env`) automatically.

### `pnpm db:backup [label]`

Creates a full database backup and writes it to the `backups/` directory.

```bash
# Unlabelled backup
pnpm db:backup

# Labelled backup
pnpm db:backup pre-migration
```

**Output file location:**

```
backups/backup-<label>-<timestamp>.json
backups/backup-2026-06-16T10-30-00-000Z.json
```

**What gets backed up:**

- All MongoDB collections except `system.*` and `backuprecords`.

**Console output example:**

```
🔌  Connecting to MongoDB…
  ✓ users (12 docs)
  ✓ patients (340 docs)
  ✓ appointments (1204 docs)
  ✓ invoices (892 docs)
  …

✅  Backup written to: /project/backups/backup-pre-migration-2026-06-16T10-30-00-000Z.json
   Collections : 28
   Documents   : 4821
   Size        : 14.3 MB
```

---

### `pnpm db:restore <path-to-file>`

Restores the database from a `.json` backup file. Prompts for confirmation before making any changes.

```bash
pnpm db:restore backups/backup-pre-migration-2026-06-16T10-30-00-000Z.json
```

**Console output example:**

```
📦  Backup file info:
   File        : /project/backups/backup-pre-migration-2026-06-16T10-30-00-000Z.json
   Timestamp   : 2026-06-16T10:30:00.000Z
   Label       : pre-migration
   Collections : users, patients, appointments, invoices, …
   Documents   : 4821

⚠️   This will OVERWRITE all current data. Type "yes" to continue: yes

🔌  Connecting to MongoDB…
  ✓ users — 12 docs restored
  ✓ patients — 340 docs restored
  ✓ appointments — 1204 docs restored
  …

✅  Restore completed successfully.
```

> The `backuprecords` collection is **never** touched by the restore script.

---

## API Endpoints

All endpoints require an active admin session.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/backups` | List backup records (paginated, no raw data) |
| `POST` | `/api/backups` | Create a new backup and store it in the database |
| `GET` | `/api/backups/:id` | Download a backup as a `.json` file |
| `DELETE` | `/api/backups/:id` | Delete a backup record |
| `POST` | `/api/backups/:id/restore` | Restore the database from a stored backup |

### `GET /api/backups`

Query params: `page` (default `1`), `limit` (default `20`, max `50`).

```json
{
  "success": true,
  "data": [
    {
      "_id": "…",
      "label": "pre-migration",
      "status": "completed",
      "collections": ["users", "patients", "…"],
      "totalDocuments": 4821,
      "sizeBytes": 14983201,
      "createdByEmail": "admin@clinic.com",
      "createdAt": "2026-06-16T10:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "pages": 1 }
}
```

### `POST /api/backups`

Optional body:

```json
{ "label": "pre-migration" }
```

Returns backup metadata (not the raw data). Status `201` on success.

### `POST /api/backups/:id/restore`

No request body required. Returns a per-collection result:

```json
{
  "success": true,
  "data": {
    "users":        { "inserted": 12, "errors": 0 },
    "patients":     { "inserted": 340, "errors": 0 },
    "appointments": { "inserted": 1204, "errors": 0 }
  },
  "message": "Database restored successfully"
}
```

---

## Backup Record Schema

Backup records are stored in the `backuprecords` MongoDB collection.

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Unique identifier |
| `tenantId` | ObjectId | Tenant scope (multi-tenant) |
| `createdBy` | ObjectId | User who triggered the backup |
| `createdByEmail` | String | Cached email for display |
| `label` | String | Optional human-readable label (max 200 chars) |
| `status` | Enum | `pending` · `completed` · `failed` · `restoring` |
| `collections` | String[] | Names of all backed-up collections |
| `totalDocuments` | Number | Total document count across all collections |
| `sizeBytes` | Number | Raw JSON size in bytes |
| `version` | String | Backup format version (currently `1.0`) |
| `data` | Mixed | Full collection data (JSON) |
| `restoredAt` | Date | When a restore was last applied from this record |
| `restoredBy` | ObjectId | User who performed the last restore |
| `createdAt` | Date | Mongoose timestamp |

---

## File Layout

```
scripts/
  db-backup.ts          ← CLI backup script
  db-restore.ts         ← CLI restore script

backups/                ← Local backup files (gitignored)
  backup-2026-06-16T….json

models/
  BackupRecord.ts       ← Mongoose model

app/api/backups/
  route.ts              ← GET (list) · POST (create)
  [id]/
    route.ts            ← GET (download) · DELETE
    restore/
      route.ts          ← POST (restore)

components/
  BackupManager.tsx     ← Admin UI component

app/(app)/admin/backups/
  page.tsx              ← Admin page at /admin/backups
```

---

## Security

- All API endpoints require a valid session with the `admin` or `owner` role.
- Every backup, download, restore, and delete action is recorded in the audit log with the acting user's ID, email, and role.
- The `backuprecords` collection is excluded from restore operations to prevent loss of backup history.
- Local backup files are excluded from git via `.gitignore` (`backups/`).

---

## Known Limitations

| Limitation | Notes |
|------------|-------|
| **MongoDB 16 MB document limit** | Each backup is stored as a single document. For databases larger than ~16 MB of JSON, the in-database storage will fail. See below for the recommended workaround. |
| **No incremental backups** | Every backup is a full snapshot. |
| **In-memory during creation** | The entire dataset is loaded into memory before being written. On large datasets this can cause high memory usage in serverless environments. |
| **Rate limiting** | The backup endpoints share the general API rate limiter (100 req/min per IP). Adjust `lib/middleware/rate-limit.ts` if you need stricter controls. |

### Handling large databases

For production databases where backup size exceeds MongoDB's 16 MB document limit, replace the `data` field storage with an external object store:

1. Upload the JSON blob to **Vercel Blob**, **AWS S3**, or **Cloudinary**.
2. Store only the resulting URL in the `BackupRecord.data` field (change type to `String`).
3. Update the download endpoint to redirect to the signed URL instead of streaming from MongoDB.
4. Update the restore endpoint to fetch the file from the URL before processing.

---

## Scheduled Backups (Cron)

You can automate backups using the existing cron infrastructure under `app/api/cron/`. Create a new cron route that calls the backup creation logic, secured with the `CRON_SECRET` bearer token (see `middleware.ts`).

For Vercel deployments, add an entry to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/backup",
      "schedule": "0 2 * * *"
    }
  ]
}
```

This triggers a backup every day at 02:00 UTC.
