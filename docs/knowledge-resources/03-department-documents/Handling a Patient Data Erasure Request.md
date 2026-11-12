# Handling a Patient Data Erasure Request

## Summary

The procedure "Handling a Patient Data Erasure Request" describes what happens when a patient asks for their personal data to be erased from a clinic's records in MyClinicSoft. Under the Privacy Policy (updated 2026-10-22), the clinic is the personal information controller for its patient records, so the clinic decides and carries out the erasure; DevCom Digital's support team and Data Protection Officer help the clinic respond. MyClinicSoft offers two modes: "anonymize" (the default, which keeps the medical record but removes everything that identifies the patient) and "delete" (which removes the clinic's records about the patient). Only a clinic administrator can run an erasure, it affects only that clinic's data, and it cannot be undone. Sales invoices, the audit trail and the patient's own eMCR (Electronic MyClinic Record) account are kept.

## Purpose

The purpose of the procedure "Handling a Patient Data Erasure Request" is to let clinics honour a patient's right under the Data Privacy Act of 2012 (RA 10173) to "Have information erased or blocked where the law allows" (Privacy Policy, "Your Rights"), in a way that is checked, confirmed and recorded in the audit log.

## When this procedure applies

The procedure "Handling a Patient Data Erasure Request" applies when a patient, or a person acting for the patient [TO CONFIRM: who may ask on a patient's behalf, for example a guardian of a minor], asks a clinic or DevCom Digital to erase the patient's data held by a clinic.

The procedure does not apply to:

- a request to see or copy records (right of access): the clinic handles it through Document requests in the web app or a patient data export;
- a request to correct records: "contact the clinic to correct them" (Terms of Service);
- closing an eMCR account, which DevCom Digital controls [TO CONFIRM: close-account path; none found];
- deleting a whole clinic (see "Deleting a Closed Clinic's Data");
- stopping text messages (see "Handling an SMS Opt-Out").

## Roles involved

| Role | Responsibility |
|---|---|
| Patient | Makes the request to the clinic (or to DevCom Digital) |
| Clinic administrator (customer) | Verifies the patient, decides whether the law allows erasure, chooses the mode, runs the erasure, replies to the patient |
| Doctor (customer) | May export the patient's data for the clinic before erasure |
| Support team | Answers clinic questions about the erasure tool; passes requests that reach DevCom Digital to the Data Protection Officer |
| Data Protection Officer | Receives patient requests sent to privacy@myclinicsoft.solutions, forwards them to the clinic and helps the clinic respond |
| Platform admin | No part in the erasure itself: "View as clinic" is read-only. Follows up stored files that could not be removed [TO CONFIRM] |

## Inputs needed before starting

| Input | Notes |
|---|---|
| The patient's request | In writing [TO CONFIRM: whether verbal requests are accepted] |
| Proof of identity | "We may need to verify your identity first" (Privacy Policy) [TO CONFIRM: what proof clinics should ask for] |
| The patient's record in the clinic | Found by the clinic in Patients |
| The clinic's decision on records it must keep by law | The clinic "decides its own retention periods for patient records within the law" (Privacy Policy) |
| A clinic administrator account | Erasure refuses any other role |

## Procedure: receive the request and decide

1. **Receive the request.** If the patient contacts the clinic, go to step 3. If the patient writes to DevCom Digital (privacy@ or support@myclinicsoft.solutions), go to step 2.
2. **Forward to the clinic.** The Data Protection Officer tells the patient that the clinic holds the records and forwards the request to the clinic administrator, offering help ("Patients … should contact the clinic first; we will help the clinic respond", Privacy Policy). For data DevCom Digital controls (eMCR account, enquiries), the Data Protection Officer handles that part directly [TO CONFIRM: how].
3. **Verify the patient.** The clinic administrator confirms the requester is the patient (or may act for the patient).
4. **Decide what the law allows.** The clinic administrator decides whether the records may be erased and which mode to use. If the clinic must keep the medical record, then use "anonymize" (step 6). If the clinic may remove its records, then use "delete" (step 6).
5. **Provide a copy first if asked.** If the patient also wants a copy, then a clinic administrator or doctor exports the patient's data, or releases it through Document requests, before step 6, because erasure cannot be undone.
## Procedure: run the erasure and reply

6. **Run the erasure.** The clinic administrator runs the patient data erasure in MyClinicSoft for that patient, with the chosen mode, an optional reason (up to 1,000 characters) and the confirmation word "DELETE". [TO CONFIRM: no screen for this was found; the function exists as the web app's data-deletion service (`/api/compliance/data-deletion`). How do clinic administrators reach it? (contradiction 48)]
7. **Check the result.** MyClinicSoft reports success and how many stored files could not be removed. If that number is above 0, then the clinic administrator tells the support team through Admin → Support, and the files are removed in a later storage clean-up [TO CONFIRM: who follows up].
8. **Reply to the patient.** The clinic administrator tells the patient what was erased and what was kept, and why [TO CONFIRM: reply template].

## What each erasure mode does

The two erasure modes in MyClinicSoft (lib/patient-erasure.ts) affect only the clinic that runs them. If other clinics also treat the patient, their records are untouched.

| | "anonymize" mode (default) | "delete" mode |
|---|---|---|
| Uploaded documents, messages, devices, surveys, eMCR invites and access requests, waitlist entries, document requests, SMS log entries | Removed | Removed |
| Visits, prescriptions, lab results, imaging, procedures, appointments, queue entries, referrals, memberships, patient notes | Kept, linked to an anonymous patient; attached files removed; visit notes replaced with "[Data anonymized]" | Removed |
| Name, contacts, ID numbers and other identifying details | Replaced with "[ANONYMIZED]" or removed; sex, medical history, pre-existing conditions, allergies, immunisations and family history kept | Removed with the record |
| Sales invoices | Kept, with the buyer's name and address copied onto them (BIR) | Kept, with the buyer's name and address copied onto them (BIR) |
| Patient record shared with other clinics | This clinic is detached; the other clinics keep their records | This clinic is detached; the record is deleted once no clinic is left |
| Audit trail, eMCR account, health-summary share links | Kept | Kept |

## Approvals required

| What | Who approves | Limit |
|---|---|---|
| Running an erasure | Clinic administrator only, with the confirmation word "DELETE" | One patient at one clinic per run |
| Choosing "delete" instead of "anonymize" | Clinic administrator [TO CONFIRM: whether the clinic's doctor or Data Protection Officer should agree] | Medical records are removed |
| DevCom Digital involvement | None needed for the clinic to act [TO CONFIRM] | |

## Exceptions and what to do

| Situation | What to do |
|---|---|
| The patient attends other clinics | Each clinic erases its own data; the patient asks each clinic separately |
| The patient also wants the eMCR account closed | Pass to the Data Protection Officer [TO CONFIRM: close-account path] |
| The law requires the clinic to keep the record | Use "anonymize", or refuse with reasons [TO CONFIRM: refusal wording] |
| The patient is a minor or a dependant | [TO CONFIRM: who may ask for a dependant] |
| A clinic administrator ran the wrong mode or wrong patient | Cannot be undone in the app; contact the support team at once [TO CONFIRM: whether a restore from backup is ever done] |
| Stored files could not be removed | See step 7 |

## Outputs and where they are recorded

| Output | Where it is recorded |
|---|---|
| Erasure event: who, when, patient, mode, reason, files not removed | The clinic's audit log, as a sensitive "data_deletion" entry |
| The patient's request and the clinic's reply | [TO CONFIRM: clinic's records] |
| Requests that came to DevCom Digital | [TO CONFIRM: Data Protection Officer's records] |

## Time targets

| Step | Target |
|---|---|
| Forwarding a request from DevCom Digital to the clinic | [TO CONFIRM] |
| Completing the erasure and replying to the patient | [TO CONFIRM: response period; none written down] |
| Removing files that could not be removed | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Data Handling and Confidentiality; Deleting a Closed Clinic's Data; Handling a Clinic Support Request; Handling an SMS Opt-Out; Customer Support Playbook; Customer FAQ |

## Open questions

1. Who may ask on a patient's behalf (for example a guardian of a minor or a family manager for a dependant)?
2. How does a patient close an eMCR account? docs/PUBLIC_SITE_FOLLOWUPS.md asks to "Confirm there is a close-account path, in-app or by support"; none was found. How does the Data Protection Officer handle the eMCR part of a request?
3. Are verbal requests accepted, and what proof of identity should clinics ask for?
4. How do clinic administrators reach the erasure function? No screen calling `/api/compliance/data-deletion` was found, yet the security page lists "Handle deletion requests from patients" as a tool clinics have (contradiction 48).
5. Who follows up stored files that could not be removed?
6. Is there a reply template, and a refusal wording when the law requires the record to be kept?
7. Should a doctor or the Data Protection Officer agree before a clinic uses "delete"? Is DevCom Digital ever involved in approving an erasure?
8. Is a restore from backup ever done when an erasure was run by mistake?
9. Where are requests and replies recorded, by the clinic and by DevCom Digital?
10. What response period applies? None is written down.
11. Owner role, effective date and review date for this procedure.
12. In "anonymize" mode, lib/patient-erasure.ts replaces visit notes because "free-text notes can name the patient", but keeps patient notes (PatientNote) and referrals unchanged. Should their free text also be cleared? (contradiction 56)
