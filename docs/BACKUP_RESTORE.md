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

## 4. Local and manual backups

- `scripts/backup/backup.sh` / `restore.sh` wrap `mongodump` / `mongorestore` for ad-hoc copies
  (e.g. before a risky migration). `restore.sh` writes into whatever `MONGODB_URI` points at, so double-check it.
- `pnpm db:backup:zip [label]` runs `mongodump` on `MONGODB_URI` and writes `backups/backup-<time>.zip`
  (needs MongoDB Database Tools on PATH). To restore: unzip, then
  `mongorestore --uri=<target> backup-<time>/` — add `--drop` only if you mean to replace existing collections.
- `pnpm db:backup` / `pnpm db:restore` use EJSON. Restore loads into temporary collections and only swaps them
  in after the whole file has been validated, and it asks for `--confirm`.
- Dumps contain patient data and password hashes: store them encrypted, never in the repo, and delete them
  when you're done.
