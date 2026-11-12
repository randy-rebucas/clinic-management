# Responding to a Suspected Data Breach

## Summary

The procedure "Responding to a Suspected Data Breach" describes how DevCom Digital handles a report or discovery that personal data in MyClinicSoft or eMCR (Electronic MyClinic Record) may have been lost, changed, deleted or seen by someone who should not see it. It is for the Data Protection Officer, platform admins and the engineers who run production [TO CONFIRM: engineering role title]. The time of discovery is recorded first, because the National Privacy Commission (NPC) must be notified within 72 hours of discovery [TO CONFIRM: breach notice wording (contradiction 31)] when the event is a personal data breach under the Data Privacy Act of 2012 (RA 10173). DevCom Digital notifies the affected clinics; each clinic is the personal information controller for its patients' records. Many roles and internal deadlines are not yet set and are marked [TO CONFIRM].

## Purpose

The purpose of the procedure "Responding to a Suspected Data Breach" is to contain a suspected breach quickly, find out which data and which clinics are affected, decide whether the NPC, clinics and patients must be told, and keep a record of what happened. The Privacy Policy (updated 2026-10-22) commits DevCom Digital to this: "If a personal data breach is likely to put people at real risk, we will notify the affected clinics and, where the law requires, the National Privacy Commission, within the periods set by its rules."

## When this procedure applies

The procedure "Responding to a Suspected Data Breach" applies when any of the following happens:

- A clinic reports suspected unauthorised access (to legal@myclinicsoft.solutions, under the Terms of Service).
- Someone outside the company reports a security issue (to support@myclinicsoft.solutions, subject "Security report").
- DevCom Digital staff notice unusual access in an audit log, an error report, a lost device or misdirected data.
- Production data is lost, corrupted or overwritten (for example ransomware, a bad migration or an accidental bulk delete).
- A copy of production data (a backup file or database dump) is lost or shared by mistake.

The procedure does not apply to a single clinic's staff member seeing their own clinic's records within their role, or to a patient asking for erasure (see "Handling a Patient Data Erasure Request"). Restoring the database is covered by "Restoring the Database After an Incident"; this procedure links to it.

## Roles involved

| Role | Responsibility |
|---|---|
| Any DevCom Digital staff member | Reports the suspected breach at once to the Data Protection Officer |
| Data Protection Officer | Leads the response, decides whether it is a personal data breach, notifies the NPC and the affected clinics, keeps the record [TO CONFIRM: that the Data Protection Officer decides on and sends the NPC notice]. No person is named yet [TO CONFIRM: named Data Protection Officer] |
| Platform admin | Checks the Platform console, suspends affected clinic accounts, removes compromised platform admin access |
| Engineer with production access [TO CONFIRM: role title] | Stops writes, investigates logs and the database, restores data, rotates keys |
| Clinic administrator (customer) | Reports suspected access at the clinic, reviews the clinic's audit log, decides with DevCom Digital whether patients are told |
| [TO CONFIRM: management role] | Approves public statements and external communication |

## Inputs needed before starting

The following inputs are needed for the procedure "Responding to a Suspected Data Breach":

| Input | Where it comes from |
|---|---|
| The report: who reported, what was seen, when, which clinic | Email to legal@, support@ or privacy@myclinicsoft.solutions; a support request; internal discovery |
| Time of discovery, in Asia/Manila time | Recorded by the person who receives the report |
| Access to the Platform console (Platform → Clinics) | Platform admin sign-in |
| A clinic's audit log (Admin → Audit log, including archived months) | Clinic administrator, or platform admin through "View as clinic" |
| Error reports | Sentry, if a DSN is set (it is optional) |
| Production access through `pnpm prod <script>` and the MongoDB Atlas and Vercel consoles | Engineer with production access |
| An incident record | [TO CONFIRM: where incident records are kept] |

## Procedure: report, record and contain

1. **Report.** The person who notices or receives the report (any staff member) forwards it to the Data Protection Officer at privacy@myclinicsoft.solutions [TO CONFIRM: internal channel and deadline] and does not discuss details outside the company.
2. **Record the discovery time.** The Data Protection Officer opens the incident record [TO CONFIRM: system] with the date and time of discovery in Asia/Manila time, the reporter and the first description. The NPC deadline in "Time targets" runs from this time.
3. **Decide whether damage is ongoing.** The Data Protection Officer and the engineer agree whether data is still being taken, changed or deleted. If yes, go to step 4. If no, go to step 6.
4. **Stop writes.** The engineer pauses the scheduled jobs (Vercel → Project → Settings → Cron Jobs) and, if needed, puts the app into maintenance by redeploying so that requests fail fast (docs/BACKUP_RESTORE.md).
5. **Lock out affected access.** The platform admin does whichever applies:
   - suspends an affected clinic in Platform → Clinics → the clinic → Suspend, which ends every staff session at that clinic;
   - removes a compromised platform admin's email from the platform admin allowlist, which ends that person's access at once;
   - asks the engineer to rotate any exposed key or password [TO CONFIRM: key rotation procedure].
6. **Preserve evidence.** The engineer keeps the relevant audit log entries, error reports and hosting logs; no record connected to the incident is deleted while the investigation is open.

## Procedure: investigate and decide

7. **Find the scope.** The engineer and the platform admin use the audit log (who viewed or changed which record, when, and from which IP address) to list the affected clinics, patients and data types. The clinic administrator checks the clinic's own audit log.
8. **Restore data if needed.** If data was deleted, corrupted or overwritten, the engineer follows "Restoring the Database After an Incident", then returns to step 9.
9. **Decide whether it is a personal data breach.** The Data Protection Officer decides, using the Privacy Policy test: is the breach "likely to put people at real risk"? If yes, go to step 10. If no, record the reasons and go to step 13.
10. **Notify the NPC.** The Data Protection Officer notifies the National Privacy Commission within the deadline in "Time targets", where the law requires [TO CONFIRM: notice wording (contradiction 31); NPC notification form and channel].
11. **Notify the affected clinics.** The Data Protection Officer tells each affected clinic administrator what happened, which of the clinic's data was involved and what DevCom Digital has done [TO CONFIRM: channel and deadline].
12. **Decide on telling patients.** The Data Protection Officer and each clinic administrator decide whether affected patients must be told; "the affected patients may also need to be told" (docs/BACKUP_RESTORE.md). For eMCR account data, DevCom Digital is the controller and tells the patients itself [TO CONFIRM: who sends the message and how].
13. **Close the incident.** The Data Protection Officer completes the record: what happened, when, which data was affected, who was notified and when, and what was changed to prevent a repeat. The engineer re-enables the scheduled jobs if they were paused.

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Suspending a clinic account | Platform admin [TO CONFIRM: whether the Data Protection Officer must agree first] | Ends every staff session at the clinic |
| Putting the app into maintenance | [TO CONFIRM: role] | Affects every clinic |
| Deciding that an event is (or is not) a personal data breach | Data Protection Officer | None stated |
| Notifying the NPC, clinics and patients | Data Protection Officer [TO CONFIRM: management sign-off] | None stated |
| Public statements | [TO CONFIRM: role] | None stated |

## Exceptions and what to do

| Situation | What to do |
|---|---|
| The report comes in outside support hours | [TO CONFIRM: out-of-hours contact]; the NPC deadline still runs from discovery |
| The Data Protection Officer is unavailable | [TO CONFIRM: deputy] |
| Only one clinic's own staff misused access within their role | The clinic is the controller; the Data Protection Officer helps the clinic administrator review the audit log and decide on notification |
| A production backup file or database dump is lost or shared | Treated as a suspected breach: these files hold real patient data and password hashes (docs/LOCAL_DEV_DATABASE.md); start at step 2 |
| The anonymised local development copy is exposed | The Data Protection Officer decides; the copy is scrubbed but is still treated as sensitive, because free text can contain a name |
| A reporter wants to publish details | Ask the reporter not to share details publicly until the issue is fixed (security page) |

## Outputs and where they are recorded

| Output | Where it is recorded |
|---|---|
| Incident record: timeline, scope, decisions, notifications | [TO CONFIRM: incident register] |
| Platform admin actions (suspend, reactivate, view as clinic) | Audit log, written automatically |
| NPC notification and acknowledgement | [TO CONFIRM] |
| Messages to clinics and patients | [TO CONFIRM] |
| Lessons learned and follow-up changes | [TO CONFIRM] |

## Time targets

| Step | Target |
|---|---|
| Staff report to the Data Protection Officer | [TO CONFIRM] |
| Containment (steps 3–5) | [TO CONFIRM] |
| NPC notification | Within 72 hours of discovery, where the law requires [TO CONFIRM: breach notice wording (contradiction 31)] |
| Notice to affected clinics | [TO CONFIRM] |
| Incident record completed | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role, for example the Data Protection Officer] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Data Handling and Confidentiality; Restoring the Database After an Incident; Handling a Clinic Support Request; Handling a Patient Data Erasure Request; Systems Overview; Teams and Responsibilities |

## Open questions

1. Who is the named Data Protection Officer, and who deputises? (docs/PUBLIC_SITE_FOLLOWUPS.md lists "Named DPO" as an open owner decision.)
2. Which role title do engineers with production access have?
3. Which management role approves external communication and public statements?
4. What is the internal channel and deadline for staff to report a suspected breach?
5. Where are incident records kept?
6. NPC notice wording (contradiction 31): the Privacy Policy says "within the periods set by its rules"; docs/BACKUP_RESTORE.md says "within 72 hours of discovery". This draft uses the 72-hour wording provisionally. What is the NPC notification form and channel?
7. What is the procedure for rotating exposed keys and passwords?
8. Through which channel, and by when, are affected clinics told?
9. Who tells eMCR account holders about a breach, and how?
10. Must the Data Protection Officer agree before a platform admin suspends a clinic? Who approves maintenance mode?
11. What is the out-of-hours contact outside the published support hours (see "Customer Support Playbook")?
12. Time targets for reporting, containment, clinic notice and closing the record.
13. Where are NPC acknowledgements, messages to clinics and patients, and lessons learned recorded?
14. Reporting channels differ: the Terms of Service send suspected unauthorised access to legal@myclinicsoft.solutions; the security page sends security reports to support@myclinicsoft.solutions. Both channels need to reach the Data Protection Officer (contradiction 49).
15. NPC registration of DevCom Digital is an open owner decision (docs/PUBLIC_SITE_FOLLOWUPS.md).
16. [TO CONFIRM: that the Data Protection Officer decides on and sends the NPC notice]: the source files name the Data Protection Officer only as the privacy contact (app/(public)/privacy/page.tsx); "Teams and Responsibilities" and "Communication and Conduct Standards" leave the role that sends the notice open.
