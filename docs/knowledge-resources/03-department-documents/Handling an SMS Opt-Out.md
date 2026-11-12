# Handling an SMS Opt-Out

## Summary

The procedure "Handling an SMS Opt-Out" describes how a patient stops text messages from MyClinicSoft clinics, and how clinic staff and the support team record and respect that choice. It is for receptionists, clinic administrators, the support team and platform admins. A patient can stop texts in four ways: the "Stop texts" link on a promotional text (one clinic), the eMCR notification settings (every clinic), asking the clinic (one clinic), or replying STOP if an inbound number is set up (every clinic). Sign-in codes are never blocked by an opt-out. SMS through Twilio is built but not yet live, and until the SMS policy is switched to enforce mode an opt-out is recorded but texts are not yet blocked; see "Going Live with SMS and Phone Codes".

## Purpose

The purpose of the procedure "Handling an SMS Opt-Out" is to make sure that a patient who asks to stop texts stops getting them from the right clinic or from every clinic, that the choice is recorded with its source, and that promotional texts go only to patients who agreed to them. Handling of the phone numbers involved follows "Data Handling and Confidentiality".

## When the SMS opt-out procedure applies

The SMS opt-out procedure applies when:

- a patient uses the "Stop texts" link in a promotional text;
- a patient turns off "Texts from clinics" in eMCR;
- a patient tells a clinic, in person or by any other channel, that they no longer want texts, or that they now agree or no longer agree to promotional texts;
- a patient asks the support team why they still get texts, or how to start them again.

The SMS opt-out procedure does not apply to:

- sign-in and confirmation codes, which are always sent when the patient asks for one;
- push notifications in eMCR, which the patient mutes per category in the same settings screen and which do not affect SMS;
- email messages;
- a request to delete the patient's data (see "Handling a Patient Data Erasure Request").

## Roles involved in an SMS opt-out

| Role | Responsibility |
|---|---|
| Patient | Chooses to stop or restart texts through the link, eMCR or the clinic |
| Receptionist | Records what the patient told the clinic on the patient's record (needs permission to change patients) |
| Clinic administrator | Same as the receptionist; can also switch off all texts for the clinic in Settings |
| Support team | Answers patient and clinic questions, checks preferences, escalates problems [TO CONFIRM: company role title] |
| Platform admin | Switches the SMS policy to enforce mode and checks the logs during go-live (see "Going Live with SMS and Phone Codes") |

## Text categories and what an opt-out blocks

| Category | Examples | Blocked by an opt-out | Other rules |
|---|---|---|---|
| Sign-in codes (`auth`) | Phone codes for sign-in | Never | Never counted against the clinic's monthly quota |
| Transactional | Appointment reminders, queue updates, notices | Yes | Counted against the quota |
| Promotional | Health reminders, greetings, offers | Yes | Needs the patient's consent; carries a "Stop texts" link; stops at 80% of the clinic's monthly quota |

MyClinicSoft checks, in this order: clinic and subscription active, the clinic's text switch, the plan feature, opt-out, promotional consent, monthly quota. Every text starts with the clinic's name, because all clinics share one sender. Patients cannot reply to the alphanumeric sender.

## Inputs needed before handling an SMS opt-out

| Input | Notes |
|---|---|
| The patient's mobile number | Preferences are kept by phone number, so a choice applies to everyone who shares that number (for example a family) |
| Scope | One clinic, or every clinic |
| What the patient wants | Stop all texts, restart texts, or give or withdraw consent to promotional texts |
| The patient's record in the clinic | Needed when staff record the choice |

## Procedure: patient stops texts through a link or eMCR

1. The patient opens the "Stop texts" link at the end of a promotional text. The page "Stop texts from [clinic]?" says that the number "will stop getting all texts from this clinic, including appointment reminders and queue updates". Opening the page changes nothing. System: MyClinicSoft public site.
2. The patient selects "Stop texts". MyClinicSoft records the opt-out for that clinic and that number, with source "link", and writes it to the clinic's audit log. The page confirms "You won't get texts from [clinic]" and that sign-in codes still arrive.
3. If the page says "This link doesn't work", then the link has expired (links last 365 days) or is damaged; the patient asks the clinic instead (go to the next procedure), or uses eMCR (step 4).
4. In eMCR, the patient opens More → notifications and settings and turns off "Texts from clinics" ("Reminders and updates by SMS, from every clinic. Sign-in codes always arrive."). MyClinicSoft records the opt-out for every clinic, with source "app". System: eMCR.
5. If the patient has no mobile number on their record, then eMCR does not show the setting; the patient asks the clinic to add a number.

## Procedure: patient asks the clinic

1. The patient tells the receptionist they want to stop texts, restart texts, or change their consent to promotional texts.
2. The receptionist opens the patient's record and finds "Text messages" ("Applies to this mobile number, including anyone sharing it"). System: MyClinicSoft web app.
3. The receptionist sets "Reminders and notices from this clinic" (off stops all texts from this clinic) and "Agreed to health reminders, greetings and offers" (promotional consent) as the patient asked.
4. If the record shows "This patient turned texts off in the eMCR app. Only they can turn them back on.", then the receptionist tells the patient to turn texts on in eMCR; the clinic cannot override it.
5. If the record has no mobile number, then there is nothing to change; MyClinicSoft answers "This patient has no mobile number on file."
6. MyClinicSoft records the change with source "staff" and writes it to the audit log with the staff member's name.
7. If the clinic wants to stop all texts to all its patients, then the clinic administrator turns off "Send text messages to patients" in the clinic's Settings, under Appointments.

## Procedure: STOP and START replies

A STOP or START reply works as follows: STOP, STOPALL, UNSUBSCRIBE, END or QUIT stops texts from every clinic, and START or UNSTOP restarts them, with source "reply". The patient receives: "You will no longer get texts from clinics using this service. Sign-in codes you ask for still arrive. Reply START to undo." Replies work only if an inbound long code is pointed at MyClinicSoft [TO CONFIRM: whether an inbound number will be set up].

## Procedure: support questions about opt-outs

1. The support team receives the question through support@myclinicsoft.solutions or a clinic's support request (see "Handling a Clinic Support Request").
2. If the patient still gets texts after opting out, then the support team checks: whether SMS is live and the policy is in enforce mode (before that, opt-outs are recorded but texts are not blocked); whether the opt-out was for one clinic and the text came from another; and whether the text was a sign-in code the patient requested. Changes reach every server within one minute.
3. If texts were sent to an opted-out number while the policy was in enforce mode, then the support team escalates to a platform admin and engineering [TO CONFIRM: escalation route and whether it is treated as a privacy incident (see "Responding to a Suspected Data Breach")].
4. To restart texts, the patient uses the same route they used to stop: eMCR or START for every clinic, or the clinic for one clinic. There is no restart link.

## Approvals required for SMS opt-outs

| What | Who approves | Limit |
|---|---|---|
| Recording a patient's own opt-out or restart | None; the patient's choice is applied | None |
| Overriding an opt-out made by the patient in eMCR or by reply | Not possible in MyClinicSoft | Only the patient can undo it |
| Sending promotional texts | The patient's consent, recorded by the clinic | Quota rule in "Text categories and what an opt-out blocks" |
| Switching the SMS policy to enforce mode | [TO CONFIRM: approving role] | See "Going Live with SMS and Phone Codes" |

## Exceptions in SMS opt-outs

| Situation | What to do |
|---|---|
| Several family members share one number | Explain that the choice applies to the number, so everyone sharing it stops getting texts |
| Patient wants reminders but no offers | Keep "Reminders and notices from this clinic" on and "Agreed to health reminders, greetings and offers" off |
| Patient wants to stop texts from one clinic only | Use that clinic's link, or ask that clinic; do not use the eMCR switch, which covers every clinic |
| Patient cannot receive texts at all | Staff can create the eMCR account with a printed temporary password instead of a text code (MOBILE_API.md) |
| Opt-out requested by email to support | [TO CONFIRM: whether support may record it, and how, since support has no patient-record access] |

## Outputs of an SMS opt-out and where they are recorded

| Output | Where it is recorded |
|---|---|
| Opt-out or restart, promotional consent, source (link, app, staff, reply) | SMS preference, kept by phone number; no clinic means every clinic [TO CONFIRM: how long preferences are kept] |
| Changes from a link or by staff | Clinic's audit log (phone number masked) |
| Changes in eMCR | Audit log, on the patient |
| Texts blocked or that would have been blocked | Server logs ("SMS policy would block", with the reason) |
| Delivery records | SMS delivery log, kept 60 days, no message bodies |

## Time targets for SMS opt-outs

| Step | Target |
|---|---|
| Opt-out takes effect | At once on the server that saved it; within one minute on the others |
| Clinic records a patient's spoken request | [TO CONFIRM: e.g. during the same visit or call] |
| Support answers an opt-out question | [TO CONFIRM] within support hours (see "Company Overview", section "Working hours, time zone and currency") |
| Opt-out link validity | 365 days from the text |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Going Live with SMS and Phone Codes; Handling a Clinic Support Request; Customer Support Playbook; Data Handling and Confidentiality; Handling a Patient Data Erasure Request; Responding to a Suspected Data Breach; Systems Overview; Company Overview |

## Open questions

1. SMS go-live date. `docs/SMS_TWILIO.md` is a go-live runbook; SMS is not yet live. Until the policy is set to enforce mode, opt-outs are recorded but texts are only logged as "would block", not stopped (`lib/sms-policy.ts`). The public FAQ and pricing pages already promise SMS confirmations and reminders (contradiction 50).
2. Who approves switching the SMS policy to enforce mode.
3. Whether an inbound long code will be pointed at MyClinicSoft so STOP and START replies work (`docs/SMS_TWILIO.md`).
4. Company role title for the support team, and the escalation route when texts reach an opted-out number in enforce mode, including whether that is a privacy incident.
5. How long SMS preferences are kept; `docs/SMS_TWILIO.md` gives 60 days only for the delivery log.
6. Whether and how support records an opt-out sent by email, given that support has no access to a clinic's patient records.
7. Time targets for recording spoken requests and answering opt-out questions.
8. Plan quotas: `docs/SMS_TWILIO.md` says the current monthly SMS numbers "are placeholders" until the Philippine rate is confirmed; promotional texts stop at 80% of whatever quota applies.
9. `lib/subscription-packages.ts` marks SMS on the Free trial as "Limited"; what that means for patients of trial clinics is not stated.
10. Contradiction 33: `app/(public)/privacy/page.tsx` lists Twilio as a sub-processor while `docs/SMS_TWILIO.md` shows SMS is not yet live.
11. Effective date, review date and owner role of this document.
