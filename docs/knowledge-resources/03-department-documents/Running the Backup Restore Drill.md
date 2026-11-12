# Running the Backup Restore Drill

## Summary

"Running the Backup Restore Drill" is the procedure for proving that the MyClinicSoft production database can be restored from its MongoDB Atlas backups, and for measuring how long a restore really takes. It is written for the engineers who operate production. The drill restores a snapshot into a temporary cluster, checks it with a local copy of the app, records the time taken and then deletes the temporary cluster; production is never touched. `docs/BACKUP_RESTORE.md` says to run the drill "once now, then quarterly". The drill only works if Atlas Cloud Backup is on, which may not be the case on the tier production currently runs on [TO CONFIRM: production cluster tier and whether Cloud Backup is on (contradiction 30)].

## Purpose

The purpose of "Running the Backup Restore Drill" is to find out, before a real incident, whether backups can be restored and how long that takes. The measured time is the real recovery time used when planning "Restoring the Database After an Incident". The source runbook is `docs/BACKUP_RESTORE.md`, section "Restore drill".

## When this procedure applies (and when it does not)

The drill applies:

- once, the first time after Atlas Cloud Backup is turned on [TO CONFIRM: whether the first drill has been run, and its date];
- then once a quarter [TO CONFIRM: which month of each quarter, and who schedules it];
- after a change to the backup policy or the cluster [TO CONFIRM: not written down; proposed].

The drill does not apply to restoring production during an incident ("Restoring the Database After an Incident"), to one clinic's in-app backups (Admin → Backups), or to loading the anonymised copy used for local development (`docs/LOCAL_DEV_DATABASE.md`).

## Roles involved

| Role | Responsibility |
|---|---|
| Operator [TO CONFIRM: role title] | An engineer with access to the Atlas project; runs the drill and records the result |
| Drill owner [TO CONFIRM: role title] | Makes sure the drill happens each quarter and reviews the result |

## Inputs needed before starting

1. Access to the MongoDB Atlas project (Clusters and Backup pages), with permission to create and delete a cluster.
2. A local copy of the MyClinicSoft web app with its dependencies installed (`pnpm install`).
3. Sign-in details for a staff user of a real clinic in production, to check the restored data [TO CONFIRM: which account is used for drills and how access to it is controlled].
4. Recent production collection counts to compare with, from `pnpm prod db:stats` [TO CONFIRM: assumed; the runbook only says counts should be "close to production"].
5. Confirmation that Atlas Cloud Backup is on for the production cluster. `docs/BACKUP_RESTORE.md` says it "Requires an M10 or larger cluster (shared/free tiers only get basic snapshots)"; `lib/backups.ts` refers to "the free tier's 512 MB". If Cloud Backup is not on, the drill cannot run as written [TO CONFIRM: contradiction 30].

## Procedure

1. **Operator (Atlas):** creates a temporary cluster in the same project, on the same MongoDB version as production, named for example `restore-drill`.
2. **Operator (Atlas → Backup):** picks a snapshot, or a point in time, and restores it with the target set to `restore-drill`. The operator notes the start time.
3. **Operator (local copy of the app):** points the local app at the temporary cluster by setting `MONGODB_URI` in `.env.local` to the `restore-drill` connection string, then starts the app.
4. **Operator (local app):** signs in as a staff user of a real clinic and opens a patient, a visit, an invoice and a prescription.
5. **Operator (command line):** runs `pnpm db:stats` and checks that collection counts are close to production. If the records do not open or the counts are far off, then record the drill as failed and go to step 8.
6. **Operator:** writes down how long the restore took, from step 2 to a usable cluster.
7. **Operator (local app):** points `.env.local` back at the local Docker database (`docs/LOCAL_DEV_DATABASE.md`), so local work never runs against the restored copy of real data.
8. **Operator (Atlas):** deletes the `restore-drill` cluster.
9. **Operator:** records the result (see "Outputs and where they are recorded"). If the drill failed, then the drill owner raises it for a fix and a repeat drill [TO CONFIRM: how failures are tracked].

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Creating a temporary Atlas cluster (it may cost money) | [TO CONFIRM: role] | [TO CONFIRM: spending limit for a drill cluster] |
| Using a real clinic staff account to check data | [TO CONFIRM: role] | |

No approval rule for the drill is written down.

## Exceptions and what to do

| Exception | What to do |
|---|---|
| Production is on a free or shared tier with no Cloud Backup | The drill cannot run as written. Raise it with the drill owner; the alternative of restoring a manual dump (`pnpm prod db:backup:zip`) into a temporary cluster is not written down [TO CONFIRM] |
| The restored cluster is on a different MongoDB version | Delete it and repeat on the production version |
| The restore takes longer than expected | Record the real time; do not stop early |

The restored cluster holds real patient data, so it is deleted in step 8 and is not shared or copied to a laptop, in line with the rule in `docs/BACKUP_RESTORE.md` that dumps of production data are stored encrypted, never in the repository, and deleted when done.

## Outputs and where they are recorded

| Output | Where recorded |
|---|---|
| Drill date (YYYY-MM-DD), snapshot or point in time used, pass or fail | [TO CONFIRM: drill log location] |
| Measured restore time (recovery time) | Drill log |
| Problems found and follow-up actions | Drill log [TO CONFIRM: issue tracker] |

## Time targets

| Target | Value | Source |
|---|---|---|
| Frequency | as set out in "When this procedure applies (and when it does not)" | `docs/BACKUP_RESTORE.md` |
| Restore time | no target set; the drill measures it [TO CONFIRM: target] | `docs/BACKUP_RESTORE.md` |
| Temporary cluster lifetime | deleted at the end of the drill | `docs/BACKUP_RESTORE.md` |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Restoring the Database After an Incident; Systems Overview; Engineering Standards and Release Procedure; Data Handling and Confidentiality |

## Open questions

1. Production cluster tier and whether Atlas Cloud Backup is on: `README.md` says "Backups use MongoDB Atlas Cloud Backup"; `docs/BACKUP_RESTORE.md` says Cloud Backup needs "an M10 or larger cluster"; `lib/backups.ts` refers to "the free tier's 512 MB" (contradiction 30).
2. Whether the first drill has been run, and on what date.
3. Which month of each quarter the drill runs, and who schedules it.
4. Whether a drill is also needed after a change to the backup policy or the cluster.
5. Role titles for the operator and the drill owner.
6. Which real clinic staff account is used for drills, and who approves its use.
7. Whether `pnpm prod db:stats` is the agreed way to get production counts for comparison.
8. Who approves the cost of the temporary cluster, and the spending limit.
9. How a drill on a free tier should work (for example from a manual dump), if at all.
10. Where the drill log is kept and how failures are tracked.
11. Target recovery time.
