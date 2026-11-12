# Invoicing and Expenses Procedure

## Summary

The "Invoicing and Expenses Procedure" describes how DevCom Digital invoices clinics for MyClinicSoft and how it should handle unpaid invoices, payments, expenses, purchases and the month-end close. It is written for the people who handle finance at DevCom Digital [TO CONFIRM: finance role title]. Invoicing is largely automatic: every completed subscription payment through PayMongo produces one BIR sales invoice, issued by MyClinicSoft with a serial number from DevCom Digital's registered range and emailed to the clinic. Subscriptions are billed in advance, in Philippine pesos (₱), and are non-refundable except where Philippine law requires otherwise. No written material describes expenses, purchases or the month-end close, so those sections are placeholders [TO CONFIRM]. The document contains no tax identification or bank details.

## Issuing an invoice: what is invoiced

DevCom Digital's invoices to clinics are BIR sales invoices. Under the Ease of Paying Taxes Act (RA 11976) and RR 7-2024, the sales invoice is the one document issued for a sale of services; official receipts are no longer primary documents (`lib/bir.ts`).

| Item | Rule | Source |
|---|---|---|
| What gets an invoice | One sales invoice per completed subscription payment | `lib/platform-invoice.ts` |
| Seller | DevCom Digital, as entered under Platform → Configuration → BIR issuer: registered name, trade name, tax identification number, branch code, registered address, VAT status and rate, permit (ATP) number and date, serial prefix and range, footer note | `lib/platform-config-schema.ts` |
| Buyer | The clinic's billing profile (registered name, tax identification number, address, email); if empty, the clinic's name, address and email | `lib/platform-invoice.ts` |
| Currency | PHP | `lib/platform-invoice.ts` |
| VAT | If the issuer is VAT-registered, the VAT inside the VAT-inclusive amount is shown separately; otherwise none. The default rate is 12% | `lib/platform-invoice.ts`; `lib/platform-config-schema.ts` |
| Dates on the invoice | Asia/Manila time | `lib/platform-invoice.ts` |

Other money flows are not covered here: clinics' own invoices to their patients (a clinic feature, `lib/bir.ts`), eMCR voucher batches ("Issuing eMCR Activation Voucher Batches") and medical representative fees (prices in "Products and Services Catalogue") [TO CONFIRM: whether a sales invoice is issued for voucher batch payments and rep fees].

## Issuing an invoice: numbering format and payment terms

The MyClinicSoft sales invoice serial number is the issuer's serial prefix, a dash, and a 7-digit number padded with zeros, for example `PREFIX-0000001`; without a prefix it is the 7-digit number alone (`lib/bir.ts`). The prefix is up to 6 letters, digits or dashes. Serials are drawn in order from the BIR-registered range, from the range start to the range end, with no gaps.

Payment terms for MyClinicSoft subscriptions:

| Term | Value | Source |
|---|---|---|
| Billing | In advance, monthly or yearly, at the prices on the pricing page, in Philippine pesos | `app/(public)/terms/page.tsx` |
| Payment methods | PayMongo: GCash, Maya, credit and debit cards, GrabPay, QR Ph | `app/(public)/faq/page.tsx` |
| Enterprise | "Enterprise customers can also pay by invoice" [TO CONFIRM: invoice terms, due date and process] | `app/(public)/faq/page.tsx` |
| Refunds | None, "except where Philippine law requires otherwise" [TO CONFIRM: contradiction 11] | `app/(public)/terms/page.tsx` |
| Taxes | The clinic is responsible for applicable taxes [TO CONFIRM: contradiction 51] | `app/(public)/terms/page.tsx` |
| Price changes | At least 30 days' notice; apply from the next billing period | `app/(public)/terms/page.tsx` |

Prices themselves are in "Products and Services Catalogue".

## Issuing an invoice: steps

1. **Platform admin (Platform → Configuration):** enters the BIR issuer details once, and enters a new serial range whenever BIR registers one. Until the issuer is entered, invoices wait as "held".
2. **Clinic administrator (Admin → Subscription):** pays for a plan through PayMongo checkout. The clinic can fill in its billing profile beforehand.
3. **MyClinicSoft (automatic):** when the payment completes, issues the sales invoice once, takes the next serial number, and emails it to the clinic's billing email with the PDF attached. The email subject is "Sales invoice <serial> for your MyClinicSoft subscription".
4. **MyClinicSoft (automatic):** if the issuer is not entered, or the serial range is used up, then marks the invoice "held" with the reason and goes no further. Go to step 5.
5. **Platform admin:** fixes the reason (enters the issuer or the new range). Saving the issuer issues the held invoices; the daily `platform-invoices` job also issues them at 00:40 UTC (08:40 Asia/Manila), up to 50 a run, and catches paid payments from the last 400 days that never got an invoice.
6. **Platform admin (platform console):** checks the clinic's payments, which show each invoice as issued, cancelled or held (with the reason) and whether it was emailed. If the email did not go out, then uses "resend" (only for issued invoices, and only when the clinic has a billing email); each resend is audit-logged.
7. **Clinic administrator:** can download the invoice at any time from Admin → Subscription → Payments.

Enterprise invoices paid outside PayMongo have no written process [TO CONFIRM].

## Following up on unpaid invoices

For PayMongo subscriptions there is no unpaid invoice: an invoice is issued only after payment. What follows a subscription that is not renewed is:

| When | What happens | Source |
|---|---|---|
| 3 days and 1 day before a free trial ends | Trial expiry warnings | `lib/automations/trial-expiration.ts` |
| Subscription end date passes without payment | Account becomes read-only for a 7-day grace period; records can still be viewed and exported | `app/(public)/terms/page.tsx`; `lib/subscription-period.ts` |
| After the grace period | Access is suspended until the clinic subscribes again; data is not deleted for a missed payment | `app/(public)/terms/page.tsx` |
| Reminders before a paid subscription ends | [TO CONFIRM: whether clinics get renewal reminders] | not written down |
| Enterprise invoices paid by invoice | [TO CONFIRM: due date, reminder timeline, escalation and who chases] | not written down |

## Recording a payment

PayMongo subscription payments record themselves. PayMongo notifies MyClinicSoft (`checkout_session.payment.paid`), the payment is added to the clinic's payment history, the subscription is extended, and the sales invoice is issued as in "Issuing an invoice: steps".

When PayMongo reports a full refund or a chargeback, the paid time is removed and the invoice is cancelled: it is never deleted and keeps its serial number. An invoice not yet issued is cancelled before it takes a number (`lib/platform-invoice.ts`). This conflicts with the "non-refundable" wording of the terms (contradiction 11).

Payments received outside PayMongo (Enterprise invoices, bank transfers) have no written recording process [TO CONFIRM: how they are recorded and who records them].

## Submitting an expense

The DevCom Digital expense rules are not written down.

| Item | Rule |
|---|---|
| Who may submit | [TO CONFIRM] |
| Spending limits by amount (₱) | [TO CONFIRM] |
| Receipts needed (BIR invoice or receipt) | [TO CONFIRM] |
| Who approves at each amount | [TO CONFIRM] |
| Where expenses are recorded (accounting system) | [TO CONFIRM] |
| Reimbursement timing | [TO CONFIRM] |

## Purchases and subscriptions

DevCom Digital pays for outside services that run MyClinicSoft, listed in "Systems Overview" (for example Vercel, MongoDB Atlas, Resend, Twilio, Cloudinary and Anthropic). No purchase rules are written down.

| Item | Rule |
|---|---|
| Approval limit for a new subscription or purchase (₱) | [TO CONFIRM] |
| Who approves | [TO CONFIRM] |
| Who holds each vendor account and payment card | [TO CONFIRM] |
| Review of recurring subscriptions | [TO CONFIRM] |
| A new service that receives personal data | Also needs the sub-processor list on the privacy page updated [TO CONFIRM: approval] |

## Month-end close checklist

The DevCom Digital month-end close is not written down. A proposed checklist, built only from what MyClinicSoft records [TO CONFIRM: whole checklist]:

1. **Finance [TO CONFIRM: role]:** checks for held invoices in the platform console and has the reason fixed.
2. **Finance:** reconciles the month's PayMongo payouts against issued sales invoices [TO CONFIRM: source of payout reports].
3. **Finance:** lists invoices cancelled for refunds or chargebacks.
4. **Finance:** checks how much of the registered serial range is left, so a new range is requested from BIR in time [TO CONFIRM: lead time].
5. **Finance:** records Enterprise and other non-PayMongo payments [TO CONFIRM].
6. **Finance:** reconciles eMCR voucher batch cash, following "Issuing eMCR Activation Voucher Batches" [TO CONFIRM].
7. **Finance:** records expenses and vendor bills [TO CONFIRM].

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Products and Services Catalogue; Systems Overview; Issuing eMCR Activation Voucher Batches; Standard Contract Terms Summary; Pricing and Discount Rules; Onboarding a New Clinic |

## Open questions

1. Finance role title and the owner of this document.
2. Whether sales invoices are issued for eMCR voucher batch payments and medical representative fees.
3. Enterprise "pay by invoice": invoice terms, due date, who issues it and how it is numbered.
4. Whether DevCom Digital's refunds and chargebacks wording is agreed: the terms say "All payments are final and non-refundable … except where Philippine law requires otherwise", while `lib/subscription.ts` and `lib/platform-invoice.ts` handle full refunds and chargebacks by removing paid time and cancelling the invoice (contradiction 11).
5. Whether clinics get reminders before a paid subscription ends.
6. Follow-up timeline, escalation and owner for unpaid Enterprise invoices.
7. How payments received outside PayMongo are recorded, and by whom.
8. Expense rules: who submits, limits in ₱, receipts, approvers at each amount, accounting system, reimbursement timing.
9. Purchase and subscription rules: approval limits in ₱, approvers, who holds vendor accounts and cards, review of recurring subscriptions, approval for a new sub-processor.
10. Month-end close: whether the proposed checklist is right, where PayMongo payout reports come from, and the lead time for a new BIR serial range.
11. Accounting system: not named in any written record (the fact sheet lists it as [TO CONFIRM]).
12. Currency on payment history: `lib/subscription-page.ts` shows payments with `p.currency || 'USD'`, while `lib/platform-invoice.ts` defaults to `'PHP'` and every price is in pesos (contradiction 13).
13. Taxes: `app/(public)/terms/page.tsx` "You are responsible for applicable taxes" versus `app/(public)/faq/page.tsx` "The price you see is the price you pay" (contradiction 51).
