# Restoring the Database After an Incident

## Summary

"Restoring the Database After an Incident" is the procedure for bringing the MyClinicSoft production database (MongoDB Atlas) back after corruption, ransomware, a bad migration, a bad deploy or an accidental bulk delete. It is written for the engineers who operate production. The procedure stops writes first, restores a snapshot to a new cluster (never straight over production), checks it, then either switches the whole application to the restored cluster or copies back only the affected records. Because the database holds patient data, every incident ends with a check for a personal data breach under the Data Privacy Act of 2012 (RA 10173). The procedure depends on Atlas Cloud Backup, which may not be available on the tier production currently runs on [TO CONFIRM: production cluster tier and whether Cloud Backup is on (contradiction 30)].

## Purpose

The purpose of "Restoring the Database After an Incident" is to recover clinic and patient records with as little data loss as possible, without making the damage worse, and to leave a record of what happened that can support a breach assessment. The source runbook is `docs/BACKUP_RESTORE.md`, section "Real incident: restoring production".

## When this procedure applies (and when it does not)

The restore procedure applies when:

- the whole production database is bad (corruption, ransomware, a bad migration); or
- some records were deleted or overwritten in production and need to be brought back.

The restore procedure does not apply to:

| Situation | Where it is covered |
|---|---|
| The scheduled practice restore | "Running the Backup Restore Drill" |
| One clinic restoring its own in-app backup from Admin → Backups | Clinic feature; `lib/backups.ts` [TO CONFIRM: support process for in-app restores] |
| Bringing archived audit-log months back into a database | `docs/BACKUP_RESTORE.md`, section "Audit log archive" |
| A suspected data breach with no data loss | "Responding to a Suspected Data Breach" |
| A failed migration caught before it wrote anything | "Running a Production Data Migration" |

## Roles involved

| Role | Responsibility |
|---|---|
| Incident lead [TO CONFIRM: role title] | Decides to start the procedure, chooses whole-database or partial restore, approves the cut-over |
| Operator [TO CONFIRM: role title] | An engineer with access to the Atlas project, the Vercel project and the production settings; runs the steps |
| Platform admin | Checks real clinic data in the restored copy if asked; tells affected clinics [TO CONFIRM: who contacts clinics] |
| Data Protection Officer | Decides whether the incident is a personal data breach and handles notice (privacy@myclinicsoft.solutions) |

## Inputs needed before starting

1. Access to the MongoDB Atlas project (Backup and Clusters pages).
2. Access to the Vercel project settings (Cron Jobs and Environment Variables).
3. The production settings file `.env.prod.local`, used by `pnpm prod <script>` (see `docs/LOCAL_DEV_DATABASE.md`).
4. MongoDB Database Tools (`mongodump`, `mongorestore`) installed on the operator's machine.
5. The time the damage started, as exactly as known, in Asia/Manila time and UTC, to pick the snapshot or point in time.
6. For a partial restore: the affected collections and clinic (`tenantId`) values.

Before starting, the operator checks which backups exist. The restore procedure assumes MongoDB Atlas Cloud Backup with snapshots and Continuous Cloud Backup (point-in-time restore). `docs/BACKUP_RESTORE.md` says Cloud Backup "Requires an M10 or larger cluster (shared/free tiers only get basic snapshots)" and that "The app does not back itself up". `lib/backups.ts` says clinic backups share "the free tier's 512 MB", which suggests production runs on a free tier. If that is so, there may be no point-in-time restore and only basic snapshots, and the newest copy may be a manual dump made with `pnpm prod db:backup:zip` [TO CONFIRM: production tier, which snapshots exist, and how often manual dumps are taken (contradiction 30)].

## Procedure: stop writes and decide

1. **Incident lead (any channel [TO CONFIRM: incident channel]):** declares the incident and names the operator.
2. **Operator (Vercel):** pauses the scheduled jobs: Vercel → Project → Settings → Cron Jobs → disable.
3. **Incident lead:** if the damage is still happening, then the operator puts the app in maintenance, for example by redeploying with the database setting `MONGODB_URI` removed so requests fail fast. If not, go to step 4.
4. **Incident lead:** decides the type of restore. If the whole database is bad, then go to step 5. If only some records were deleted or overwritten, then go to step 9.

## Procedure: whole-database restore

5. **Operator (Atlas):** creates a new cluster in the same project, on the same MongoDB version.
6. **Operator (Atlas → Backup):** restores the chosen snapshot, or a point in time just before the damage, to the new cluster. Never restore over production as a first step.
7. **Operator (local copy of the app):** verifies the new cluster with the checks in "Running the Backup Restore Drill". If the checks fail, then pick an earlier snapshot and repeat from step 6.
8. **Operator (Vercel), with incident lead approval:** switches `MONGODB_URI` in Vercel to the new cluster and redeploys. Go to step 13.

## Procedure: partial restore of affected records

9. **Operator (Atlas):** restores the snapshot or point in time to a new cluster, as in steps 5 and 6.
10. **Operator (command line):** for each affected collection and clinic, exports only the affected documents from the restored cluster with `mongodump`, filtered by collection and by the clinic's `tenantId`.
11. **Operator (command line):** loads them into production with `mongorestore`, limited to that collection with `--nsInclude`, and without `--drop`.
12. **Operator:** checks record counts in production before and after each collection, per clinic, and writes them down.

## Procedure: resume and record

13. **Operator (Vercel):** re-enables the cron jobs. The scheduled jobs catch up on reminders they missed; they track what was already sent, so nothing is sent twice.
14. **Operator:** takes the app out of maintenance if step 3 was used, and confirms `/api/health` answers normally.
15. **Incident lead:** records what happened, when, which clinics and which data were affected, and the restore point used.
16. **Incident lead and Data Protection Officer:** decide whether patient data was involved in a way that makes this a personal data breach under the Data Privacy Act. If yes, then start "Responding to a Suspected Data Breach". If no, then close the incident record.
17. **Operator (Atlas):** once production is stable on the right cluster, removes the clusters no longer needed [TO CONFIRM: how long to keep the old or restored cluster before deleting it].

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Starting the procedure and pausing crons | Incident lead [TO CONFIRM: role title] | [TO CONFIRM] |
| Putting the app in maintenance | Incident lead [TO CONFIRM] | [TO CONFIRM] |
| Switching production to a restored cluster | Incident lead [TO CONFIRM] | [TO CONFIRM] |
| Writing restored records into production | Incident lead [TO CONFIRM] | [TO CONFIRM] |
| Notifying the National Privacy Commission (NPC) and patients | Data Protection Officer [TO CONFIRM: who signs the notice] | |

No approval rule for these steps is written down.

## Exceptions and what to do

| Exception | What to do |
|---|---|
| No Atlas snapshot or point-in-time restore exists (free tier) | Use the newest manual dump: unzip a `backups/backup-<time>.zip` from `pnpm prod db:backup:zip` and load it into a new cluster with `mongorestore`; then continue at step 7. Expect more data loss [TO CONFIRM: contradiction 30] |
| A restore to production is needed with `--drop` | Use `--drop` only when replacing whole collections is intended (`docs/BACKUP_RESTORE.md`) |
| Restored dumps on a laptop | Dumps contain patient data and password hashes: keep them encrypted, never in the repository, and delete them when done |
| Ad-hoc script `restore.sh` | The script writes into whatever `MONGODB_URI` points at: check the target first |

## Outputs and where they are recorded

| Output | Where recorded |
|---|---|
| Incident record (what, when, which data, restore point) | [TO CONFIRM: incident log location] |
| Before and after counts per collection and clinic | Incident record |
| Breach decision | Incident record; "Responding to a Suspected Data Breach" if a breach |
| New production cluster in use | Vercel environment variables |

## Time targets

| Target | Value | Source |
|---|---|---|
| Recovery time | The time measured in the latest restore drill [TO CONFIRM: no target set] | `docs/BACKUP_RESTORE.md` |
| Point-in-time restore window | at least 2 days (recommended policy) | `docs/BACKUP_RESTORE.md` |
| NPC notice, if a personal data breach | within 72 hours of discovery [TO CONFIRM: wording (contradiction 31)] | `docs/BACKUP_RESTORE.md` |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Running the Backup Restore Drill; Responding to a Suspected Data Breach; Running a Production Data Migration; Systems Overview; Engineering Standards and Release Procedure; Data Handling and Confidentiality |

## Open questions

1. Production cluster tier: is it the free tier, and is Atlas Cloud Backup with point-in-time restore on? `docs/BACKUP_RESTORE.md` and `README.md` ("Backups use MongoDB Atlas Cloud Backup") describe Cloud Backup; `docs/BACKUP_RESTORE.md` says it needs M10 or larger; `lib/backups.ts` refers to "the free tier's 512 MB". The privacy page ("Regular backups") and terms page ("We keep backups of the Service") make public promises that depend on this (contradiction 30).
2. How often manual production dumps are taken, and where they are kept, if Cloud Backup is not on.
3. Role titles for the incident lead and the operator.
4. Who approves starting the procedure, maintenance mode, the cut-over and writing restored records.
5. Incident channel and where the incident record is kept.
6. Support process when a clinic needs an in-app backup restored.
7. Who contacts affected clinics during and after an incident.
8. How long to keep the old and restored clusters before deleting them.
9. Recovery time target: none is set; the drill only measures it.
10. NPC notice wording: `docs/BACKUP_RESTORE.md` says "within 72 hours of discovery"; `app/(public)/privacy/page.tsx` says "within the periods set by its rules" (contradiction 31). Also who signs the notice.
