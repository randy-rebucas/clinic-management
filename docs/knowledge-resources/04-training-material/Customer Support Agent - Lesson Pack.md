# Customer Support Agent: Lesson Pack

## Summary

The Customer Support Agent: Lesson Pack teaches a new customer support agent [TO CONFIRM: role title and whether the role exists separately from platform admin] how DevCom Digital supports clinics, patients and medical representatives who use MyClinicSoft and eMCR (Electronic MyClinic Record). It covers what the role does and does not do, five rules with their reasons, three worked examples taken from real situations in the support material, and the mistakes to avoid. The most important facts: clinic administrators open support requests in Admin → Support, everyone else writes to support@myclinicsoft.solutions, payments are non-refundable except where Philippine law requires otherwise, and privacy requests follow their own procedures. The detailed rules live in "Customer Support Playbook" and "Handling a Clinic Support Request".

## What the role is responsible for

The customer support agent is responsible for:

- answering support requests in the platform console (`/platform/support`) and emails to support@myclinicsoft.solutions during support hours;
- giving the standard answers in "Customer Support Playbook" and "Customer FAQ";
- setting each support request's status (Open, In progress, Resolved, Closed) and keeping the whole conversation on the request;
- recognising requests that belong to another procedure and passing them on;
- handing a request to a person when a trigger in "Customer Support Playbook" applies.

The customer support agent is not responsible for:

- deciding refunds, discounts, extra days or other price exceptions ("Pricing and Discount Rules", which is confidential);
- correcting or releasing a patient's medical records, which the clinic manages;
- giving medical advice or judging AI visit notes;
- deciding data deletion, erasure or breach notification, which follow their own procedures;
- agreeing Enterprise support terms, which are set in each contract.

Whether the agent may also use the platform-admin tools (view as clinic, extend a period, suspend a clinic) is [TO CONFIRM: platform-admin access for support agents].

## Rule 1: say only what MyClinicSoft does

The customer support agent answers only from the knowledge library and never promises what the product or the company has not backed. The reason: the 2026-10-22 public-site audit removed claims of 24/7, phone and chat support, proration, add-ons, multi-location, white-label and "DPA compliant", along with testimonials and uptime figures, because nothing backed them (docs/PUBLIC_SITE_FOLLOWUPS.md). The list of claims that may and may not be made is in "Brand Voice and Writing Style Guide".

## Rule 2: payments are non-refundable, and exceptions go to a person

The customer support agent tells customers that payments are final and non-refundable, except where Philippine law requires otherwise [TO CONFIRM: refund policy (contradiction 11)], and hands every refund, discount or extra-days request to a person. The reason: this is the rule in the Terms of Service, and the authority to make exceptions is not given to support [TO CONFIRM: who decides exceptions]. eMCR activation vouchers are also non-refundable and cannot be exchanged for cash.

## Rule 3: the clinic owns its patients' records

The customer support agent refers a patient who wants records corrected or copied to their clinic. The reason: the clinic is the personal information controller for the records it keeps, and DevCom Digital only processes them for the clinic (Privacy Policy). Problems with the eMCR app itself stay with support.

## Rule 4: privacy, deletion, opt-out and breach requests follow their own procedure

The customer support agent moves these requests out of the normal flow at once:

| Request | Procedure |
|---|---|
| Patient data erasure | "Handling a Patient Data Erasure Request" |
| Deleting a closed clinic's data | "Deleting a Closed Clinic's Data" |
| Stopping text messages | "Handling an SMS Opt-Out" |
| Possible data leak or unauthorised access | "Responding to a Suspected Data Breach" |

The reason: these requests carry legal duties under the Data Privacy Act of 2012 (RA 10173), and the company has promised specific outcomes, such as deleting a closed clinic's data within 30 days of a written request.

## Rule 5: keep the conversation on the support request

The customer support agent answers clinic requests inside the platform console and quotes the reference SR-XXXXXX, rather than replying from a personal mailbox. The reason: the request holds the whole thread, its status and who spoke last; the queue view "Waiting on us" depends on it; and the notification emails can fail without the request being lost. A reply sent from the console reaches the clinic by email and in the app, and a reply from the clinic reopens a resolved request.

## Worked example 1: the clinic cannot add patients after the subscription ended

The situation: a clinic administrator opens a support request under "Billing or subscription" saying the clinic can see its records but cannot add new patients or appointments.

A good response, step by step:

1. Open the request from "Waiting on us" in the platform console and read the thread.
2. Recognise the read-only grace period: when a subscription is not renewed, the account is read-only for 7 days; records can be viewed and exported, but new patients, appointments, visits, doctors and staff accounts cannot be added.
3. Reply that the clinic can renew from its subscription page, that the data is safe (it is not deleted for a missed payment), and that after the 7 days access is suspended until the clinic subscribes again.
4. If the administrator says the clinic has already paid, hand the request to a person to check the payment.
5. When the clinic confirms it is working again, set the request to Resolved, or use "Send and resolve" on the last reply.

The documents it relies on: "Customer Support Playbook" (section "Clinic account is read-only after the subscription ended") and "Handling a Clinic Support Request".

## Worked example 2: a patient's activation code is refused

The situation: a patient emails support@myclinicsoft.solutions saying the eMCR app will not accept the activation code printed on the voucher they bought at their clinic; the app says the code has not been paid for.

A good response, step by step:

1. Recognise the reason "Not paid": the clinic has not yet paid DevCom Digital for that voucher batch, so its codes cannot be redeemed.
2. Reply to the patient that the code itself is valid once the clinic settles its batch, and that they should ask the clinic; do not mention what the clinic pays for vouchers.
3. Tell the person who manages voucher batches that the clinic has unpaid codes in circulation, following "Issuing eMCR Activation Voucher Batches".
4. Remind the patient that a patient can try 10 codes an hour, and that after a code is accepted some features may take up to 30 seconds to open.

The documents it relies on: "Customer Support Playbook" (section "eMCR activation code is not accepted") and "Issuing eMCR Activation Voucher Batches".

## Worked example 3: a clinic asks for money back after changing plan

The situation: a clinic administrator moved from a yearly plan to a cheaper plan and asks for the unused months back.

A good response, step by step:

1. Recognise a refund request, which the agent does not decide.
2. Reply politely with the rule from the Terms of Service: payments are final and non-refundable, including for unused time and downgrades, except where Philippine law requires otherwise.
3. Do not promise a credit for the unused time: how plan changes are charged has not been confirmed [TO CONFIRM: how plan changes are charged (contradiction 1)].
4. Hand the request to a person if the clinic disputes the charge or says Philippine law entitles it to a refund.
5. Keep the request In progress until the person decides, then reply with the decision and resolve it.

The documents it relies on: "Customer Support Playbook" (section "Refunds, credits and exceptions") and "Pricing and Discount Rules" (for the person who decides).

## Common mistakes and how to avoid them

| Mistake | How to avoid it |
|---|---|
| Saying MyClinicSoft is "DPA compliant" or "encrypted at rest" | Say "built for the Data Privacy Act of 2012 (RA 10173)"; leave encryption at rest out until it is confirmed |
| Promising phone, chat or 24/7 support, or a response time [TO CONFIRM: whether in-app support chat counts as a support channel (contradiction 53)] | Give the published support hours; response targets are not set |
| Promising a refund, prorated credit or extra days | Apply Rule 2 and hand the request to a person |
| Quoting the clinic's voucher price or commission to a patient or clinic prospect | That price is confidential and lives only in "Pricing and Discount Rules" |
| Trying to fix a patient's record | Refer the patient to the clinic (Rule 3) |
| Treating a contact-form message as a support request | The contact form only opens an email to the support mailbox; it creates no request |
| Asking a receptionist or doctor to open a support request | Only clinic administrators can; ask them to go through their administrator |
| Calling a support request a "ticket" or a clinic a "tenant" | Use the words in "Brand Voice and Writing Style Guide" |
| Giving advice on what an AI visit note means for a patient | AI visit notes are drafts a licensed professional must review; MyClinicSoft gives no medical advice |
| Giving a release date for eMCR on iPhone or for MyClinicSoft Rep | No dates are set; say "coming soon" |
| Forgetting that a reply from the clinic reopens a resolved request | Check "Waiting on us" every shift |

## Where to find more

- "Customer Support Playbook": channels, hours, refunds, hand-over triggers and common issues.
- "Handling a Clinic Support Request": the step-by-step procedure in the platform console.
- "Customer FAQ": customer-safe answers.
- "Products and Services Catalogue": plans, limits and public prices.
- "Brand Voice and Writing Style Guide": words to use and avoid, and claims.
- "Data Handling and Confidentiality": how customer data is handled.
- "Handling a Patient Data Erasure Request", "Deleting a Closed Clinic's Data", "Handling an SMS Opt-Out", "Responding to a Suspected Data Breach", "Issuing eMCR Activation Voucher Batches".

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Customer Support Playbook; Handling a Clinic Support Request; Customer FAQ; Products and Services Catalogue; Brand Voice and Writing Style Guide; Data Handling and Confidentiality; Pricing and Discount Rules; Handling a Patient Data Erasure Request; Deleting a Closed Clinic's Data; Handling an SMS Opt-Out; Responding to a Suspected Data Breach; Issuing eMCR Activation Voucher Batches |

## Open questions

1. [TO CONFIRM: role title and whether the role exists separately from platform admin]: the source files name a "support team" (faq page) and platform admins who answer requests (lib/support.ts), but no support job title.
2. [TO CONFIRM: platform-admin access for support agents].
3. [TO CONFIRM: who decides exceptions] (refunds, discounts, extra days).
4. [TO CONFIRM: how plan changes are charged (contradiction 1)].
5. Response targets, priority levels and the time zone of support hours are not set (see "Customer Support Playbook", Open questions).
6. [TO CONFIRM: owner role], effective date and review date.
7. [TO CONFIRM: whether in-app support chat counts as a support channel] lib/support-chat.ts gives each clinic staff member an in-app chat thread with the platform team (the platform console also has a "Waiting on us" chat view), while docs/PUBLIC_SITE_FOLLOWUPS.md removed "phone/chat" support claims as unbacked (contradiction 53).
8. [TO CONFIRM: refund policy (contradiction 11)]: the Terms of Service say all payments are final and non-refundable; lib/subscription.ts removes paid time when PayMongo reports a full refund or chargeback.
