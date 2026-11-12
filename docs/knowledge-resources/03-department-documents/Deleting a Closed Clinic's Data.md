# Deleting a Closed Clinic's Data

## Summary

The procedure "Deleting a Closed Clinic's Data" describes how DevCom Digital deletes a clinic's data from MyClinicSoft after the clinic has closed its account and a clinic administrator has asked in writing. The Terms of Service and Privacy Policy (both updated 2026-10-22) promise deletion within 30 days of the written request, "except for anything the law requires us to keep". Deletion is done by an engineer with production access [TO CONFIRM: role title] with the command-line tool `pnpm prod tenant:delete`; there is no screen for it in the Platform console. The tool removes the clinic's uploaded files and records, detaches the clinic from patient and medical representative records that other clinics share, and keeps BIR sales invoices and eMCR (Electronic MyClinic Record) voucher records. Deletion cannot be undone.

## Purpose

The purpose of the procedure "Deleting a Closed Clinic's Data" is to meet the deletion promise in the Terms of Service ("Data & Content", "After termination") and the Privacy Policy ("Data Retention") in a controlled, checked and recorded way, without deleting records that the law or other clinics and patients still need.

## When this procedure applies

The procedure "Deleting a Closed Clinic's Data" applies when:

- a clinic's account is closed [TO CONFIRM: what counts as "closed": cancelled, expired after the 7-day grace period, or suspended], and
- a clinic administrator of that clinic has asked DevCom Digital in writing to delete the clinic's data.

The procedure does not apply when:

- the clinic has only missed a payment: "Your data is not deleted because a payment was missed" (Terms of Service);
- the request is about one patient (see "Handling a Patient Data Erasure Request");
- the request comes from someone who is not a clinic administrator of the clinic;
- the account is still active or read-only; the clinic can still export its data, so the request is answered by explaining the export first [TO CONFIRM: whether DevCom Digital deletes an active clinic's data on request].

## Roles involved

| Role | Responsibility |
|---|---|
| Clinic administrator (customer) | Sends the written request; exports any records the clinic must keep before asking |
| Support team | Receives the request, logs it, confirms receipt, tells the clinic when deletion is done [TO CONFIRM: whether support or legal owns the request] |
| Platform admin | Checks in the Platform console that the requester is an administrator of the clinic and that the account is closed |
| Engineer with production access [TO CONFIRM: role title] | Runs `pnpm prod tenant:delete`, checks the output, removes leftovers, saves the deletion summary |
| Data Protection Officer | Informed of every deletion; decides questions about data the law requires DevCom Digital to keep [TO CONFIRM] |

## Inputs needed before starting

| Input | Notes |
|---|---|
| The written request | Email to legal@, support@ or privacy@myclinicsoft.solutions, or a support request from Admin → Support [TO CONFIRM: accepted channels] |
| Date the request was received | Recorded in Asia/Manila time; the deletion deadline in "Time targets" runs from this date |
| The clinic's ID or subdomain | From Platform → Clinics |
| Proof the requester is a clinic administrator | Platform → Clinics → the clinic lists its administrators |
| Production access | The production settings file used by `pnpm prod`; MongoDB Atlas access to the production cluster |
| Cloudinary configured | The tool removes uploaded files only when Cloudinary is configured |

## Procedure: check the request

1. **Log the request.** The support team logs the written request with its date of receipt [TO CONFIRM: where] and replies to confirm receipt.
2. **Check the requester.** The platform admin opens Platform → Clinics → the clinic and confirms that the requester is one of its administrators. If not, then the support team replies that only a clinic administrator can ask, and the procedure stops.
3. **Check the account is closed.** The platform admin confirms the account status. If the account is still active or read-only, then the support team tells the clinic administrator that the data can still be exported and asks the administrator to confirm the request once the account is closed; the procedure pauses until then.
4. **Inform the Data Protection Officer.** The support team tells the Data Protection Officer that a deletion is scheduled and its deadline date [TO CONFIRM].
5. **Schedule the run.** The engineer picks a time well before the deadline and tells the support team.

## Procedure: run the deletion

6. **Start the tool against production.** The engineer runs `pnpm prod tenant:delete`. `pnpm prod` shows the production cluster and asks for confirmation (y/N). Running `pnpm tenant:delete` without `prod` uses the local development database instead.
7. **Read the plan.** The tool lists the records it will keep ("Kept for record retention": PlatformInvoice, SubscriptionOrder, VoucherBatch, ActivationCode). If the tool stops with "These models point at Tenant in a way this script does not know how to delete", then the engineer stops, has the new data type classified in scripts/delete-tenant.ts through the normal release process (see "Engineering Standards and Release Procedure"), and starts again at step 6.
8. **Identify the clinic.** The engineer enters the clinic ID or subdomain. The tool shows the clinic's name, subdomain, status and creation date. If any of these do not match the request, then the engineer types anything other than the subdomain at the next prompt, which cancels the run, and the procedure stops.
9. **Check the data summary.** The tool lists, per collection, how many records will be deleted and how many shared records will be detached.
10. **Confirm twice.** The engineer types the clinic's subdomain, then "yes". The tool then deletes the clinic's files from Cloudinary, deletes every record the clinic owns, and detaches the clinic from shared patient and medical representative records (a record no other clinic uses is deleted).
## Procedure: check and confirm

11. **Check what is left.** The tool verifies that no record still refers to the clinic. If it reports documents that still exist, then the engineer answers "no", investigates, and restarts at step 6 once fixed [TO CONFIRM: escalation].
12. **Check files.** If the tool lists Cloudinary files "Not deleted", then the engineer removes them by hand in Cloudinary.
13. **Remove audit-log archive files.** The tool deletes the clinic's audit log and its archive index from the database, but not the archive files in Vercel Blob storage. The engineer removes the clinic's folder of audit-log archive files [TO CONFIRM: whether these files are deleted or kept, and how (contradictions 54 and 55)].
14. **Save the summary.** The engineer saves the deletion summary (documents deleted, shared records detached, "Tenant Deleted: Yes") with the request record.
15. **Confirm to the clinic.** The support team tells the clinic administrator in writing that the data was deleted, and which records were kept by law.

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Running the deletion on production | [TO CONFIRM: role, for example the Data Protection Officer] | One clinic per run; cannot be undone |
| Continuing when the tool reports remaining records | [TO CONFIRM: role] | |
| Changing what the tool keeps or deletes | [TO CONFIRM: role]; through the normal release process | |

## Exceptions and what to do

| Situation | What to do |
|---|---|
| A patient also attends other clinics | The tool keeps the patient record for the other clinics and removes only this clinic's link, files, guardians and clinic-scoped sign-in |
| Records the law requires DevCom Digital to keep | Kept automatically: BIR sales invoices and subscription orders (RA 11976 and RR 7-2024) [TO CONFIRM: retention period] |
| eMCR vouchers the clinic sold | Kept, because patients bought them and an unused code must still activate |
| The clinic asks for its data back after deletion | Not possible: the tool warns "This action CANNOT be undone!" |
| Copies in production database backups | [TO CONFIRM: how long backups keep the deleted data; the Privacy Policy says "Backups and logs are overwritten on a rolling basis" (contradiction 32)] |
| Copies in the anonymised local development database | Removed at the next refresh from a newer backup [TO CONFIRM] |
| The deletion deadline will be missed | [TO CONFIRM: escalation and whether the clinic is told] |

## Outputs and where they are recorded

| Output | Where it is recorded |
|---|---|
| The written request and its date | [TO CONFIRM: support request or email archive] |
| Deletion summary from the tool | Saved with the request record [TO CONFIRM: where] |
| Confirmation sent to the clinic administrator | [TO CONFIRM] |
| Retained records (invoices, orders, vouchers) | Stay in the production database |

The tool deletes the clinic's own audit log, so no in-app audit entry records the deletion; the saved summary is the record.

## Time targets

| Step | Target |
|---|---|
| Confirm receipt of the request | [TO CONFIRM] |
| Deletion completed | Within 30 days of the written request (Terms of Service; Privacy Policy) |
| Confirmation to the clinic | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Data Handling and Confidentiality; Handling a Patient Data Erasure Request; Handling a Clinic Support Request; Standard Contract Terms Summary; Engineering Standards and Release Procedure; Systems Overview |

## Open questions

1. Which role title do engineers with production access have?
2. What counts as a "closed" account: cancelled, expired after the grace period, or suspended? The clinic account statuses in the code are active, inactive and suspended.
3. Does DevCom Digital delete an active clinic's data on request, or only after closure?
4. Who owns deletion requests: the support team or legal? Which channels count as "in writing", and where is the request logged?
5. Must the Data Protection Officer be told of, or approve, every deletion? Who approves continuing when records remain, and who approves changes to the tool?
6. Audit-log archive files in Vercel Blob storage are not removed by scripts/delete-tenant.ts (it deletes the database index of them), so they stay in storage with nothing pointing at them and the 5-year clean-up in lib/audit-archive.ts, which works from that index, never removes them. Should they be deleted with the clinic or kept as the record of processing? lib/patient-erasure.ts keeps the audit trail as "the record of processing the DPA requires the clinic to keep", while the clinic deletion removes the clinic's audit log entirely (contradictions 54 and 55).
7. How long do production backups keep a deleted clinic's data? (contradiction 30: docs/BACKUP_RESTORE.md says Cloud Backup "Requires an M10 or larger cluster"; lib/backups.ts refers to "the free tier's 512 MB".)
8. How long are BIR sales invoices and subscription orders kept?
9. What happens when the 30-day deadline will be missed?
10. Where are the deletion summary and the confirmation to the clinic stored?
11. Contradiction 34: docs/PUBLIC_SITE_FOLLOWUPS.md says "No tenant purge exists", while scripts/delete-tenant.ts (`pnpm tenant:delete`) deletes a clinic's data from the command line. The follow-up list also asks to "Build a platform-admin purge (all tenant collections plus Cloudinary files) or document the manual runbook"; this document is that runbook.
12. Time targets for confirming receipt and confirming completion.
