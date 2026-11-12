# Customer Support Playbook

## Summary

The Customer Support Playbook describes how DevCom Digital supports clinics, patients and medical representatives who use MyClinicSoft and eMCR (Electronic MyClinic Record). It is for the support team and platform admins [TO CONFIRM: support role title]. Clinic administrators get help through the in-app support request system; everyone else writes to support@myclinicsoft.solutions; there is no phone or chat support. Payments are non-refundable except where Philippine law requires otherwise, and response targets and priority levels have not yet been set. The step-by-step handling of a request is in "Handling a Clinic Support Request".

## Support channels and hours

The support channels published on the MyClinicSoft website:

| Who | Channel | Notes |
|---|---|---|
| Clinic administrators | Admin → Support (`/admin/support`) in the MyClinicSoft web app | The fastest route; replies arrive in the app and by email. Other staff ask their clinic administrator |
| Medical representatives | Support in the MyClinicSoft Rep app | The Rep app is not yet released |
| Patients and visitors, or anyone who cannot sign in | support@myclinicsoft.solutions, or the contact form at `/contact` | The contact form opens an email in the visitor's own mail app; it does not create a support request |
| Patients with questions about their records | Their clinic first | The clinic manages its patients' records |
| Security reports | support@myclinicsoft.solutions with the subject "Security report" | |
| Privacy and data rights | privacy@myclinicsoft.solutions (Data Protection Officer) | |
| Legal questions and suspected unauthorised access to an account | legal@myclinicsoft.solutions | |

No phone number is published, and phone, chat and round-the-clock support are not offered.

The published support hours are in "Company Overview", section "Working hours, time zone and currency" [TO CONFIRM: support hours are Asia/Manila time; holidays].

Sources: app/(public)/support/page.tsx; app/(public)/contact/page.tsx; components/PublicPage.tsx; components/ContactForm.tsx; app/(public)/security/page.tsx; app/(public)/privacy/page.tsx; app/(public)/terms/page.tsx; docs/PUBLIC_SITE_FOLLOWUPS.md.

## Response and resolution targets

Response and resolution targets are not set in the source files. The table below is a placeholder until the owner decides them.

| Priority | First response | Resolution |
|---|---|---|
| [TO CONFIRM: priority levels] | [TO CONFIRM] | [TO CONFIRM] |

The published commitments are only these: the support team replies during support hours, in the order messages arrive (contact page); Professional and Enterprise requests are handled first (FAQ); Enterprise response times are agreed in the contract (support page). The support level for each plan is listed in "Products and Services Catalogue" [TO CONFIRM: support level per plan (contradiction 6)].

## How to set priority

How to set priority is not defined in the source files beyond one rule: requests from clinics on Professional and Enterprise are handled before others, and otherwise requests are answered in the order they arrive. The support request system itself has no priority field; it has a category (General question, Something is not working, Billing or subscription, Accounts and sign-in, Getting set up, Other) and sorts by last activity (source: lib/support.ts; lib/platform-console.ts).

Examples of situations the source files treat as urgent by giving them their own procedure, pending a decision on priority levels [TO CONFIRM: priority levels and examples]:

| Situation | Procedure |
|---|---|
| Possible data leak or unauthorised access | "Responding to a Suspected Data Breach" |
| A clinic cannot work because its subscription has ended | See the section "Clinic account is read-only after the subscription ended" |

## Standard procedure for a new request

1. The support team identifies who is asking (clinic administrator, other clinic staff, patient, medical representative or visitor) and through which channel.
2. The support team checks whether the request belongs to its own procedure (data erasure, closed-clinic deletion, SMS opt-out, suspected breach, onboarding, voucher batches). If it does, the support team follows that procedure.
3. The support team checks the common issues in this playbook and the "Customer FAQ" for a standard answer.
4. For a support request in the platform console, the support team answers, sets the status and resolves it as described in "Handling a Clinic Support Request".
5. For an email to support@myclinicsoft.solutions, the support team answers by email [TO CONFIRM: how support mailbox emails are logged and tracked].
6. The support team hands the request to a person when one of the triggers in "When to hand over to a person" applies.

## Refunds, credits and exceptions

The refund rule is the one in the Terms of Service (updated 2026-10-22): "All payments are final and non-refundable, including for unused time in a billing period, downgrades, and accounts closed early, except where Philippine law requires otherwise." eMCR activation vouchers are also non-refundable and cannot be exchanged for cash. The support team does not offer refunds and points customers to the free trial for trying the product first.

| Exception | Rule | Who decides |
|---|---|---|
| A refund that Philippine law may require | Not defined | [TO CONFIRM: who decides and the limit] |
| A full refund or chargeback made through PayMongo | The system takes back the paid month or year, cancels the plan when nothing paid for is left, and cancels the BIR sales invoice. A partial refund changes nothing in the subscription | [TO CONFIRM: who may issue a refund in PayMongo] |
| Extra days as goodwill or a trial extension | A platform admin can extend the current period by 1–365 days | [TO CONFIRM: approval limit]; rules in "Pricing and Discount Rules" |

The refund rule and the code disagree on whether refunds happen at all [TO CONFIRM: refund policy (contradiction 11)].

Sources: app/(public)/terms/page.tsx; lib/subscription.ts; app/api/platform/tenants/[id]/route.ts.

## When to hand over to a person

Anyone answering support questions hands a request to a person [TO CONFIRM: role that receives each hand-over] when:

1. Someone reports a possible data breach, a security weakness or unauthorised access to an account.
2. Someone asks to exercise a right under the Data Privacy Act of 2012 (RA 10173): access, correction, erasure, objection or portability. These go to the Data Protection Officer or the clinic.
3. A closed clinic asks in writing for its data to be deleted.
4. Someone asks for a refund, a chargeback is reported, or a customer says Philippine law entitles them to a refund.
5. A clinic asks for a price exception, a discount, extra days or Enterprise contract terms.
6. A clinic asks about legal terms, liability or disputes.
7. A clinic needs its account suspended or reactivated.
8. A user asks for medical advice or how to act on an AI visit note. MyClinicSoft does not give medical advice, and AI drafts must be reviewed by a licensed professional (source: terms page).
9. The answer is not in this playbook, the "Customer FAQ" or the source files.

## Clinic account is read-only after the subscription ended

When a subscription is not renewed, the clinic's account becomes read-only for a 7-day grace period. During the grace period the clinic can still view and export its records, but cannot add patients, appointments, visits, doctors or staff accounts. After the 7 days, access is suspended until the clinic subscribes again. The clinic's data is not deleted because a payment was missed. The standard resolution is to ask a clinic administrator to renew from the clinic's subscription page; if the clinic has already paid and is still read-only, the support team hands the request to a platform admin to check the payment.

Sources: app/(public)/terms/page.tsx; lib/subscription-period.ts.

## Free trial ending

Every clinic starts with a 14-day free trial [TO CONFIRM: trial length (contradictions 12 and 42)], no credit card needed. The system warns the clinic 3 days and 1 day before the trial ends. To keep going, the clinic chooses a paid plan; everything set up during the trial stays. If the clinic does not subscribe, the grace-period rules in the section "Clinic account is read-only after the subscription ended" apply. Whether unused trial days are kept when a clinic buys a plan before the trial ends is [TO CONFIRM: trial days when buying a plan (contradiction 2)].

Sources: app/(public)/terms/page.tsx; app/(public)/pricing/page.tsx; lib/automations/trial-expiration.ts.

## Clinic wants to change plan

A clinic administrator switches plans from the clinic's subscription page. How a plan change is charged is [TO CONFIRM: how plan changes are charged (contradiction 1)]: the pricing page says changes take effect immediately, the FAQ says the new plan starts when it is paid and old time is not prorated or refunded, and the code converts the days left on the old plan at the two plans' daily prices. Until the owner decides, the support team does not promise either outcome and hands billing disputes to a person.

## Clinic asks how to pay

Subscriptions are paid in Philippine pesos through PayMongo, which accepts GCash, Maya, credit and debit cards, GrabPay and QR Ph. Enterprise customers can also pay by invoice. There is no setup fee. Plan prices are in "Products and Services Catalogue".

Source: app/(public)/faq/page.tsx; app/(public)/pricing/page.tsx.

## Staff member cannot open a support request

Only clinic administrators can open or reply to support requests. Other staff see "Only clinic administrators can contact support". The standard resolution is to ask the clinic administrator to open the request in Admin → Support.

Source: app/api/support/route.ts; app/(public)/support/page.tsx.

## Patient asks about their medical records

The clinic manages a patient's records and is the personal information controller for them. The standard resolution is to refer the patient to their clinic for corrections or copies. Problems with the eMCR app itself stay with the support team.

Sources: app/(public)/faq/page.tsx; app/(public)/privacy/page.tsx.

## eMCR activation code is not accepted

eMCR activation vouchers are bought for cash at a participating clinic counter; each code activates the eMCR account for 365 days, and a renewal adds a year to the current expiry. The app shows codes as three groups of four characters; dashes, spaces and letter case are ignored. The app refuses a code for one of three reasons:

| Reason | Meaning | Standard resolution |
|---|---|---|
| Invalid | Not a real code | Check the code was typed correctly |
| Used | Already redeemed | Ask the clinic that sold it |
| Not paid | The clinic has not yet paid for that voucher batch | Ask the clinic to settle the batch; see "Issuing eMCR Activation Voucher Batches" |

A patient can try 10 codes an hour. After a code is accepted, some features may still ask for activation for up to 30 seconds. Activation is only enforced once DevCom Digital switches the activation gate on; until then all eMCR features stay open [TO CONFIRM: whether the activation gate is on in production].

Sources: lib/emcr/activation.ts; MOBILE_API.md; app/(public)/terms/page.tsx.

## Patient asks what eMCR costs

Clinics do not pay for eMCR. Some eMCR features may need activation with a voucher bought for cash at a participating clinic; the voucher price is in "Products and Services Catalogue". Without activation, a patient can always view a basic summary of their own records. The eMCR app never sells anything and shows no prices. Most public pages do not yet mention the voucher fee [TO CONFIRM: eMCR fee disclosure (contradiction 7)].

Sources: app/(public)/terms/page.tsx; MOBILE_API.md; docs/PUBLIC_SITE_FOLLOWUPS.md.

## Patient cannot use an eMCR invite

A clinic invite (printed slip or texted link) works once and lasts 14 days. An invite that is used or expired cannot be reused. If the clinic changed the patient's record after issuing the invite, the app refuses it. In each case the standard resolution is to ask the clinic for a new invite.

Source: MOBILE_API.md.

## Patient who booked online cannot find their record in eMCR

Records created by a patient through public booking or registration stay out of eMCR until clinic staff open and save the record. The standard resolution is to ask the clinic's front desk to open and save the patient's record.

Source: docs/PUBLIC_SITE_FOLLOWUPS.md.

## Patient asks whether eMCR runs on iPhone

eMCR is available on Android through Google Play; the iOS version is "coming soon" [TO CONFIRM: iOS release date (contradiction 28)].

Source: app/(public)/faq/page.tsx.

## Clinic asks to export its data

A clinic can export its data while its account is active or read-only. Clinic administrators can also take in-app backups at any time. Whether the Free trial includes data export is [TO CONFIRM: data export on the Free trial (contradiction 4)].

Sources: app/(public)/terms/page.tsx; app/(public)/faq/page.tsx; app/(public)/security/page.tsx.

## Closed clinic asks for its data to be deleted

After a clinic's account is closed, a clinic administrator can ask in writing for the clinic's data to be deleted, and DevCom Digital deletes it within 30 days of the request, except for anything the law requires it to keep. The support team follows "Deleting a Closed Clinic's Data".

Source: app/(public)/terms/page.tsx; app/(public)/privacy/page.tsx.

## Patient asks for their data to be erased

The support team refers a patient to their clinic for clinic records and follows "Handling a Patient Data Erasure Request" for anything DevCom Digital controls.

## Patient or clinic wants to stop text messages

The support team follows "Handling an SMS Opt-Out". SMS is not yet live [TO CONFIRM: SMS go-live date (contradiction 50)].

## Clinic wants to import records

A clinic can send its existing records, for example as CSV or Excel exports, and DevCom Digital helps bring them over; larger migrations are handled together with the team (source: faq page). Who does the import and how long it takes is [TO CONFIRM: import owner role and time].

## Clinic asks about several locations

Each clinic location currently runs as its own MyClinicSoft account; managing several locations from one account is on the roadmap [TO CONFIRM: multi-location support (contradiction 5)].

## Closing a request

A request is resolved when the platform admin presses "Send and resolve" or sets the status to Resolved; the requester is told, and a reply from the clinic reopens it. A request is closed by setting the status to Closed [TO CONFIRM: when a resolved request is closed]. The full steps are in "Handling a Clinic Support Request".

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Handling a Clinic Support Request; Customer FAQ; Products and Services Catalogue; Pricing and Discount Rules; Handling a Patient Data Erasure Request; Deleting a Closed Clinic's Data; Handling an SMS Opt-Out; Responding to a Suspected Data Breach; Issuing eMCR Activation Voucher Batches; Onboarding a New Clinic; Customer Support Agent: Lesson Pack; Company Overview |

## Open questions

1. [TO CONFIRM: support role title] for the people who answer support.
2. [TO CONFIRM: support hours are Asia/Manila time; holidays] (components/PublicPage.tsx gives no time zone or holidays).
3. [TO CONFIRM: priority levels], first-response and resolution targets, and examples for each level. None in the source files.
4. [TO CONFIRM: support level per plan (contradiction 6)]: pricing page says "Priority email support" for Professional; lib/subscription-packages.ts gives Professional phone and chat support and Enterprise "24/7". Related: lib/support-chat.ts gives clinic staff an in-app chat thread with the platform team, while docs/PUBLIC_SITE_FOLLOWUPS.md removed chat-support claims (contradiction 53); this playbook says chat support is not offered.
5. [TO CONFIRM: how support mailbox emails are logged and tracked].
6. [TO CONFIRM: who decides and the limit] for refunds that Philippine law may require, and [TO CONFIRM: who may issue a refund in PayMongo].
7. [TO CONFIRM: refund policy (contradiction 11)]: terms, pricing and FAQ say payments are non-refundable; lib/subscription.ts reverses paid time after a full refund or chargeback.
8. [TO CONFIRM: approval limit] for period extensions by a platform admin.
9. [TO CONFIRM: role that receives each hand-over].
10. [TO CONFIRM: trial days when buying a plan (contradiction 2)].
11. [TO CONFIRM: how plan changes are charged (contradiction 1)].
12. [TO CONFIRM: whether the activation gate is on in production].
13. [TO CONFIRM: eMCR fee disclosure (contradiction 7)].
14. [TO CONFIRM: iOS release date (contradiction 28)].
15. [TO CONFIRM: data export on the Free trial (contradiction 4)].
16. [TO CONFIRM: SMS go-live date (contradiction 50)]: the pricing page lists "SMS and email reminders" under "Every plan includes" and the FAQ says the clinic confirms bookings by SMS, while docs/SMS_TWILIO.md says SMS is not yet live.
17. [TO CONFIRM: import owner role and time].
18. [TO CONFIRM: multi-location support (contradiction 5)].
19. [TO CONFIRM: when a resolved request is closed].
20. [TO CONFIRM: owner role], effective date and review date.
21. Channel for reports of unauthorised access: the terms page sends them to legal@myclinicsoft.solutions, the security page sends security reports to support@myclinicsoft.solutions (contradiction 49). The channel table lists both until the owner picks one.
22. [TO CONFIRM: trial length (contradictions 12 and 42)]: the terms page and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts gives 7 days, and the trial emails in lib/automations/trial-expiration.ts say "7-day trial period".
