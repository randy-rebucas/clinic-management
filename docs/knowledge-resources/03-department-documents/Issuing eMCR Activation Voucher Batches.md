# Issuing eMCR Activation Voucher Batches

## Summary

The procedure "Issuing eMCR Activation Voucher Batches" describes how a platform admin makes a batch of eMCR activation vouchers for a clinic, prints them, records the clinic's payment so the codes start working, and voids lost vouchers or whole batches. It is for platform admins and the support team. Each voucher carries a 12-character activation code that gives a patient's eMCR (Electronic MyClinic Record) account 365 days; patients buy vouchers for cash at the clinic counter. A batch starts unpaid, and its codes cannot be redeemed until a platform admin marks it paid in Platform → Vouchers. Prices are not repeated here: the patient price is in "Products and Services Catalogue" and the clinic's batch price is in "Pricing and Discount Rules".

## Purpose

The purpose of the procedure "Issuing eMCR Activation Voucher Batches" is to make sure that every voucher a patient can redeem was paid for by the clinic that sells it, that every batch and payment can be traced to a platform admin, and that printed codes cannot be used before payment or after they are voided. No money moves through the eMCR app: the apps never show prices or "buy" wording (MOBILE_API.md).

## When the voucher batch procedure applies

The voucher batch procedure applies when:

- a participating clinic orders eMCR activation vouchers to sell at its counter;
- a clinic pays for a batch it has received;
- a printed voucher is lost or stolen, or a whole batch must be withdrawn;
- vouchers must be reprinted.

The voucher batch procedure does not apply to:

- a patient whose code does not work, or who paid for a voucher and lost it before redeeming it. A platform admin handles these through the eMCR account lookup described in "Exceptions in voucher batches", and the support request itself follows "Handling a Clinic Support Request";
- changing the default voucher prices in Platform → Configuration (see "Pricing and Discount Rules");
- MyClinicSoft subscriptions, which clinics pay through PayMongo.

## Roles involved in voucher batches

| Role | Responsibility |
|---|---|
| Platform admin | Makes batches, prints voucher sheets, records payment, voids codes and batches, grants eMCR days by hand |
| Clinic administrator | Orders vouchers, pays for the batch, receives and stores the printed sheets |
| Receptionist | Sells vouchers to patients for cash at the counter [TO CONFIRM: which clinic role sells vouchers] |
| Patient | Enters the code or scans the QR code in eMCR (Activation screen) |
| Support team | Answers "my code didn't work" questions; the eMCR account lookup itself needs platform admin access [TO CONFIRM: company role title] |
| Finance | Reconciles batch payments with receipts or deposits [TO CONFIRM: company role and whether a BIR sales invoice is issued to the clinic for each batch] |

## Inputs needed before issuing a voucher batch

| Input | Notes |
|---|---|
| Clinic | Must be an active MyClinicSoft clinic; chosen from a list |
| Number of vouchers | 1 to 1,000 per batch (form default 50) |
| Plan | Basic or Plus. Today both unlock the same eMCR features; Plus is "reserved for extras" [TO CONFIRM: whether Plus vouchers are sold] |
| Patient price and clinic price | Filled in from Platform → Configuration. The clinic price can never be above the patient price. Changing them for one batch needs approval (see "Approvals required for voucher batches") |
| Days of eMCR per voucher | 365 by default; the system accepts 1 to 1,098 |
| Notes | Optional, up to 500 characters |
| Clinic's order | [TO CONFIRM: how clinics order vouchers and where the order is kept] |

## Procedure: making and printing a voucher batch

1. The platform admin signs in to the platform console and opens Platform → Vouchers. System: MyClinicSoft platform console.
2. Under "New batch", the platform admin chooses the clinic, number of vouchers, plan and days, checks the prices, adds notes, and selects "Make batch".
3. The platform admin reads the confirmation, which shows the amount that will be due from the clinic, and confirms. MyClinicSoft creates the batch with a number in the format EV-YYYYMMDD-NNNN, creates the codes, sets the batch to unpaid, and writes the batch to the audit log.
4. On the batch page, the platform admin opens "Print vouchers". Every view of the codes is written to the audit log.
5. The platform admin prints on A4, scale 100%, no headers or footers. Each page holds ten vouchers (95 × 55 mm, dashed cut lines) showing eMCR, the clinic name, the patient price, the validity, the code and a QR code, with the line "Open the eMCR app → Activation → enter this code, or scan the QR." While the batch is unpaid, every voucher carries the watermark "UNPAID — NOT ACTIVE YET".
6. If the sheets must be reprinted, then the platform admin prints again from the same page; only unused codes print unless "Show all codes" is chosen, and used or void codes carry "USED" or "VOID".
7. The platform admin sends the sheets to the clinic [TO CONFIRM: how sheets are delivered and whether delivery waits for payment, given the watermark].

## Procedure: recording payment for a voucher batch

1. The clinic administrator pays the amount due for the batch [TO CONFIRM: accepted payment methods; the console asks for a "receipt or deposit ref"].
2. The platform admin opens the batch page in Platform → Vouchers and, under "Mark paid", enters the receipt or deposit reference (required), the amount received in ₱, and optional notes.
3. If the amount received is not the amount due, then MyClinicSoft asks the platform admin to confirm. The platform admin records the difference in the notes and informs Finance [TO CONFIRM: policy for part payments].
4. MyClinicSoft sets the batch to paid, records the date, the platform admin's email, the reference and the amount, and writes it to the audit log. From this moment patients can redeem the codes. Only an unpaid batch can be marked paid.
5. The platform admin tells the clinic administrator that the vouchers are active [TO CONFIRM: how].
6. Finance checks the "Received" and "Outstanding" columns under "By clinic" on Platform → Vouchers against receipts and deposits [TO CONFIRM: how often].

## Procedure: voiding a voucher or a batch

1. The clinic administrator reports a lost or stolen voucher, or a batch to withdraw, to the support team or a platform admin.
2. For one voucher: the platform admin opens the batch, enters the code as printed under "Void one voucher" and an optional reason. Only an unused code can be voided. If the code was already redeemed, then it cannot be voided; go to "Exceptions in voucher batches".
3. For a whole batch: the platform admin enters a reason under "Void batch" and confirms. All unused codes stop working at once; codes already redeemed stay redeemed. A void cannot be undone.
4. MyClinicSoft writes each void, with the reason, to the audit log.

## How patients redeem voucher codes

A patient enters the code in eMCR (dashes, spaces and letter case are ignored) or scans the QR code. Each code adds its days to the account; a renewal is added after the end of the current year. A family profile uses the manager's activation. The app answers "This voucher has already been used", "This voucher isn't active yet. Please ask the clinic that sold it to you" (batch not yet marked paid) or "That code isn't valid" (unknown or void code). One account can try 10 codes per hour. eMCR sends renewal reminders 30 days and 7 days before the activation ends and on the day it ends. Paid eMCR features are refused without an active activation only once the activation gate is switched on in the server settings; until then every feature stays open [TO CONFIRM: whether the activation gate is on in production].

## Approvals required for voucher batches

| What | Who approves | Limit |
|---|---|---|
| Making a batch at the configured prices | Platform admin | 1–1,000 vouchers per batch [TO CONFIRM: whether larger orders, or a first order from a clinic, need further approval] |
| Changing the patient price or clinic price for one batch | [TO CONFIRM: approving role] | Rules in "Pricing and Discount Rules" |
| Changing the days per voucher from 365 | [TO CONFIRM: approving role] | System limit 1–1,098 days |
| Marking a batch paid with a different amount | [TO CONFIRM: approving role] | [TO CONFIRM] |
| Voiding a batch | Platform admin [TO CONFIRM: second approval] | Cannot be undone |
| Granting eMCR days by hand | Platform admin | 1–1,098 days, reason required [TO CONFIRM: policy limit] |

## Exceptions in voucher batches

| Situation | What to do |
|---|---|
| Patient says the code is "not active yet" | The batch is unpaid. The platform admin checks whether the clinic has paid and, if so, marks the batch paid |
| Patient paid for a voucher that was lost before it was redeemed | The platform admin voids the code if it is known, then finds the patient's eMCR account by mobile number under Platform → Vouchers and uses "Grant days by hand" with a reason |
| Patient complaint about activation | The platform admin may grant days by hand with a reason; the grant is in the account's history and the audit log |
| Patient asks for a refund | Vouchers "are non-refundable and cannot be exchanged for cash" (terms page) |
| A voided or used code still circulates | The code cannot be redeemed; reprints show "VOID" or "USED" |
| Clinic closes with unsold vouchers | [TO CONFIRM: whether unsold paid vouchers are voided, credited or refunded] |

## Outputs of voucher batches and where they are recorded

| Output | Where it is recorded |
|---|---|
| Batch (number, clinic, quantity, plan, days, prices, status, creator) | MyClinicSoft database; Platform → Vouchers |
| Codes | Stored encrypted and as a keyed hash; shown in clear only on the print page |
| Batch creation, code views and prints, payment, voids, manual grants | Audit log, with the platform admin's email |
| Payment reference and amount received | The batch record |
| Totals per clinic (paid codes, redeemed, in stock, received, outstanding) | Platform → Vouchers, "By clinic" |
| Patient activation history | The patient's eMCR account |

## Time targets for voucher batches

| Step | Target |
|---|---|
| Making a batch after a clinic order | [TO CONFIRM] |
| Marking a batch paid after payment arrives | [TO CONFIRM] |
| Voiding a reported lost or stolen voucher | [TO CONFIRM] |
| Reconciling batch payments | [TO CONFIRM] |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Products and Services Catalogue; Pricing and Discount Rules; Handling a Clinic Support Request; Invoicing and Expenses Procedure; Systems Overview; Customer Support Playbook |

## Open questions

1. Which clinic role sells vouchers to patients, and the company role titles for the support team and Finance.
2. Whether a BIR sales invoice is issued to the clinic for each batch, and where batch payments are booked (see "Invoicing and Expenses Procedure").
3. Whether Plus vouchers are sold; `lib/emcr/activation.ts` says "Today both unlock everything; `plus` is reserved for extras".
4. How clinics order vouchers, how printed sheets are delivered, and whether delivery waits for payment.
5. Accepted payment methods for batches. The terms page says patients buy vouchers "for cash"; the console accepts a "receipt or deposit ref" for the clinic's payment. Policy for part payments.
6. Who may approve per-batch price changes, non-standard days, part payments, batch voids and manual grants, and their limits.
7. Whether the eMCR activation gate is switched on in production. `MOBILE_API.md`: "until then everything stays open".
8. What happens to unsold paid vouchers when a clinic closes.
9. Time targets for making, activating, voiding and reconciling batches.
10. Contradiction 7: the terms page says "Clinics do not pay for eMCR", while clinics pay for voucher batches before selling them (`lib/emcr/activation.ts`; `app/api/platform/vouchers/route.ts`). The public wording may need to say clinics do not pay a subscription for eMCR.
11. Contradiction 8: `lib/emcr/activation.ts` fixes the voucher prices in code, while `lib/platform-config.ts` lets a platform admin change them, and the new-batch form lets the platform admin change them for one batch. Which value is authoritative?
12. Effective date, review date and owner role of this document.
