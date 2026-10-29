# Backup and restore

Production backups use **MongoDB Atlas Cloud Backup**. The app does not back itself up: the in-app
backup only exports one clinic's data, and the old nightly backup cron was removed because it saved nothing.

## 1. Turn on Atlas Cloud Backup (one-time)

Requires an M10 or larger cluster (shared/free tiers only get basic snapshots).

1. Atlas → your project → **Clusters** → *Edit configuration* → **Additional settings** → enable **Cloud Backup**.
2. Atlas → **Backup** → *Backup policy*. Recommended for patient data:

   | Snapshot | Keep for |
   |---|---|
   | Every 6 hours | 2 days |
   | Daily | 14 days |
   | Weekly | 8 weeks |
   | Monthly | 12 months |

3. Enable **Continuous Cloud Backup** (point-in-time restore) with a restore window of at least 2 days.
   This is what saves you from a bad deploy or an accidental bulk delete in the middle of the day.
4. Optional but recommended: **Backup Compliance Policy** (Atlas → Project settings) so snapshots can't be
   deleted or shortened, even by a project owner whose account is compromised.
5. Optional: **Snapshot distribution** to a second region, so a regional outage doesn't take the backups with it.

## 2. Restore drill (do this once now, then quarterly)

Never restore straight over production as a first step. Restore to a separate cluster, check it, then cut over.

1. Create a temporary cluster in the same project (same MongoDB version), e.g. `restore-drill`.
2. Atlas → **Backup** → pick a snapshot (or *Point in time*) → **Restore** → target `restore-drill`.
3. Point a local copy of the app at it (`MONGODB_URI=<restore-drill URI>` in `.env.local`) and check:
   - log in as a staff user of a real clinic, open a patient, a visit, an invoice and a prescription;
   - `pnpm db:stats` shows collection counts close to production.
4. Write down how long the restore took (that's your real recovery time), then delete `restore-drill`.

## 3. Real incident: restoring production

1. **Stop writes.** Pause the Vercel crons (Vercel → Project → Settings → Cron Jobs → disable) and, if the
   damage is ongoing, put the app in maintenance (e.g. redeploy with the DB URI removed so requests fail fast).
2. Decide what you need:
   - **Whole database is bad** (corruption, ransomware, bad migration): restore the snapshot or point-in-time
     *to a new cluster*, verify it as in the drill, then switch `MONGODB_URI` in Vercel to the new cluster
     and redeploy.
   - **Some records were deleted or overwritten**: restore to a new cluster, then copy only the affected
     documents back with `mongodump --uri=<restored> --db=<db> --collection=<c> --query='{"tenantId":{"$oid":"..."}}'`
     followed by `mongorestore --uri=<prod> --nsInclude=<db>.<c>` (no `--drop`). Do this per collection and
     per clinic, and check the counts before and after.
3. Re-enable the crons. Expect the scheduled jobs to catch up on reminders they missed (they track what was
   already sent, so nothing is sent twice).
4. Record what happened, when, and which data was affected. Patient data was involved, so check whether
   this is a personal data breach under the Data Privacy Act. If it is, the NPC must be notified within
   72 hours of discovery, and the affected patients may also need to be told.

## 4. Audit log archive

The weekly `data-retention` cron moves each clinic's audit log entries out of the database once their
calendar month is more than ~90 days old (`lib/audit-archive.ts`). They go to a **private Vercel Blob store**
as one file per clinic per month: gzipped JSON lines in canonical Extended JSON (the backup format).
An entry is deleted from the database only after its file was read back and matched by checksum and entry
count. Files are deleted after **5 years**. The flag-based "archived" field is no longer used.

**Setup (one-time):** Vercel → Storage → create a Blob store with **Private** access (the access mode
can't be changed later), pick a region near the database, then *Connect to Project* for Production.
Vercel adds `BLOB_STORE_ID`; the SDK authenticates with OIDC. Until a store is connected, nothing moves.
After deploying, run `pnpm prod db:indexes --apply` (new `auditlogarchives` collection) and
`pnpm prod db:indexes --drop --apply` (drops the old `archived` index).

**Reading an archive:** admins download a month from *Admin → Audit log → Archived months* (each download
is itself audit-logged). To search one in a database again:
`gunzip audit-log-2026-05.jsonl.gz && mongoimport --uri=<target> --collection=auditlogs --file=audit-log-2026-05.jsonl`
(use a scratch database, not production, unless you mean to bring the entries back).

## 5. Local and manual backups

Local development uses an anonymized copy in Docker: see [LOCAL_DEV_DATABASE.md](LOCAL_DEV_DATABASE.md).
Commands below that should hit production run through `pnpm prod <script>` (e.g. `pnpm prod db:backup:zip`).

- `scripts/backup/backup.sh` / `restore.sh` wrap `mongodump` / `mongorestore` for ad-hoc copies
  (e.g. before a risky migration). `restore.sh` writes into whatever `MONGODB_URI` points at, so double-check it.
- `pnpm db:backup:zip [label]` runs `mongodump` on `MONGODB_URI` and writes `backups/backup-<time>.zip`
  (needs MongoDB Database Tools on PATH). To restore: unzip, then
  `mongorestore --uri=<target> backup-<time>/` — add `--drop` only if you mean to replace existing collections.
- `pnpm db:backup` / `pnpm db:restore` use EJSON. Restore loads into temporary collections and only swaps them
  in after the whole file has been validated, and it asks for `--confirm`.
- Dumps contain patient data and password hashes: store them encrypted, never in the repo, and delete them
  when you're done.
