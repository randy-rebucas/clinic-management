# Pricing and Discount Rules

## Summary

Pricing and Discount Rules is a confidential document for sales and finance [TO CONFIRM: role titles] that sets out the MyClinicSoft price list, the eMCR activation voucher prices to patients and to clinics, medical representative fees, and how price exceptions are made and recorded. All prices are in Philippine pesos (PHP, ₱) and are the defaults in the code; a platform admin can change every one of them in Platform → Configuration, so each carries [TO CONFIRM: live price] until the owner confirms the live value. The eMCR voucher costs the patient ₱80 and the clinic ₱60, so the clinic keeps ₱20 (25%) on each voucher it sells. The source files contain no discount limits or approval authority; those are [TO CONFIRM]. Public prices and plan limits are in "Products and Services Catalogue".

## Price list

| Product | List price | Currency | Billing period |
|---|---|---|---|
| Free trial | ₱0 | PHP | 14 days [TO CONFIRM: trial length (contradictions 12 and 42)] |
| Basic | ₱1,499 [TO CONFIRM: live price] | PHP | Month |
| Basic, yearly | ₱14,990 (10 × monthly) [TO CONFIRM: live price] | PHP | Year |
| Professional | ₱3,999 [TO CONFIRM: live price] | PHP | Month |
| Professional, yearly | ₱39,990 (10 × monthly) [TO CONFIRM: live price] | PHP | Year |
| Enterprise | ₱9,999 [TO CONFIRM: live price and whether it is published or quoted] | PHP | Month |
| Enterprise, yearly | ₱99,990 (10 × monthly) [TO CONFIRM: live price] | PHP | Year |
| Setup fee | None | PHP | — |
| eMCR activation voucher, price to the patient (face value) | ₱80 [TO CONFIRM: live price] | PHP | 365 days of eMCR activation |
| eMCR activation voucher, price to the clinic (wholesale) | ₱60 [TO CONFIRM: live price] | PHP | Per voucher, paid by the clinic for each batch |
| Medical representative, individual plan | ₱0 (booking is free) [TO CONFIRM: live price] | PHP | Month; a year costs the same multiple as clinic plans |
| Medical representative, team seat | ₱0 (team plans not sold online) [TO CONFIRM: live price] | PHP | Per seat per month; a year costs the same multiple |
| Medical representative, activation fee | ₱0 (reps are activated by hand) [TO CONFIRM: live price] | PHP | Once |

Sources: lib/subscription-period.ts (`DEFAULT_PRICING`); lib/platform-config.ts (`DEFAULT_FEES`); lib/emcr/activation.ts; lib/rep-billing.ts; app/(public)/pricing/page.tsx; app/(public)/terms/page.tsx; app/api/tenants/onboard/route.ts.

## Price list rules

The rules that apply to every price in the price list:

| Rule | Detail | Source |
|---|---|---|
| Where prices are set | A platform admin changes plan prices, the yearly multiple and fees in Platform → Configuration; until then the code defaults apply | lib/platform-config.ts |
| Minimum price | Every plan price must be at least ₱20, the PayMongo minimum. Each medical representative fee must be ₱0 or at least ₱20 | lib/platform-config-schema.ts |
| Yearly price | A year costs the monthly price × "months a yearly plan costs", 1–12, default 10 ("two months free") [TO CONFIRM: yearly wording (contradiction 9)] | lib/subscription-period.ts; lib/platform-config-schema.ts |
| Voucher prices | The clinic's price may not be above the patient's price | lib/platform-config-schema.ts |
| Effect of a price change | New checkouts are charged the new price; orders already started keep the amount they were created with. Clinics get at least 30 days' notice, and the change applies from their next billing period | app/api/platform/configuration/route.ts; terms page |
| Record of a price change | Every save is written to the audit log with the platform admin's email and the old and new values; the console shows when each section was last saved and by whom | app/api/platform/configuration/route.ts; lib/platform-config.ts |
| Currency | Pesos only, through PayMongo | docs/PUBLIC_SITE_FOLLOWUPS.md |

## Costs and target margins

DevCom Digital's costs and target margins for MyClinicSoft are not in the source files [TO CONFIRM: costs and target margins].

The only margin in the source files is the clinic's share of the eMCR voucher: the clinic buys each voucher at the wholesale price (₱60) and sells it to the patient for cash at the face value (₱80), keeping ₱20, a 25% commission on the face value. No money moves through the eMCR app. The platform console reports, per clinic, the codes paid for, redeemed and unredeemed, cash received and outstanding, patient spend and clinic commission (sources: lib/emcr/activation.ts; lib/emcr/vouchers.ts). The voucher prices are fixed in code in one file and configurable in another [TO CONFIRM: where the voucher price is set (contradiction 8)].

## Discount limits

The source files contain no discount limits, discount sizes or approval authority [TO CONFIRM: discount policy]. The table is a placeholder for the owner's decision.

| Discount size | Who may approve | Conditions |
|---|---|---|
| [TO CONFIRM] | [TO CONFIRM] | [TO CONFIRM] |

The tools that can lower what a customer pays, and which therefore need a rule, are:

- the yearly multiple, which applies to every clinic and every medical representative at once;
- extending a clinic's current period by 1–365 days (see "How a price exception is requested and recorded");
- a different face value or wholesale price on a single voucher batch.

The discounts in lib/discount-calculator.ts (PWD, senior citizen and membership discounts) apply to clinics' bills to their own patients. They are a MyClinicSoft feature, not discounts given by DevCom Digital.

## Special terms: payment terms

| Term | Rule | Source |
|---|---|---|
| Billing | In advance, monthly or yearly, through PayMongo (GCash, Maya, credit and debit cards, GrabPay, QR Ph) | terms page; faq page |
| Enterprise | May pay by invoice [TO CONFIRM: invoice payment terms, such as days to pay] | faq page |
| Paying early | A payment made before the current period ends adds a month or a year after the current end, so paid days are not lost | lib/subscription-period.ts |
| Switching plans | Unused days on the old plan are converted at the two plans' daily prices (a month counted as 30 days, a year as 365); trial days carry nothing [TO CONFIRM: how plan changes are charged (contradiction 1); trial days (contradiction 2)] | lib/subscription-period.ts |
| Missed payment | 7-day read-only grace period, then access is suspended; data is not deleted | terms page; lib/subscription-period.ts |
| Taxes | The clinic is responsible for applicable taxes; each payment gets a BIR sales invoice | terms page; lib/platform-invoice.ts |
| eMCR voucher batches | A batch starts unpaid; its codes can be printed but cannot be redeemed until a platform admin marks the batch paid after the cash is received | app/api/platform/vouchers/route.ts |

## Special terms: multi-year, non-profit and partners

| Term | Rule | Source |
|---|---|---|
| Multi-year | No multi-year price exists; the longest billing period is one year | lib/subscription-period.ts |
| Non-profit | No non-profit price exists [TO CONFIRM: non-profit terms] | none |
| Clinics as voucher resellers | Clinics buy eMCR vouchers at the wholesale price and sell them for cash; vouchers are non-refundable and cannot be exchanged for cash | lib/emcr/activation.ts; terms page |
| Medical representative teams | A team manager buys seats; each seat covers one team member for the period | lib/rep-billing.ts |
| eMCR voucher length | 365 days by default; a batch can be made for 1 to 1,098 days | app/api/platform/vouchers/route.ts |

## Refunds and chargebacks

The refund rule is in the Terms of Service: "All payments are final and non-refundable … except where Philippine law requires otherwise." When PayMongo reports that a subscription payment was refunded in full or charged back, the system takes the paid month or year off the paid-until date, cancels the plan when nothing paid for is left, marks the payment refunded and cancels its BIR sales invoice. A partial refund changes nothing in the subscription. Who may issue a refund in PayMongo, and up to what amount, is [TO CONFIRM: refund authority and limit] [TO CONFIRM: refund policy (contradiction 11)].

Sources: app/(public)/terms/page.tsx; lib/subscription.ts.

## What never gets discounted

The source files do not list items that may never be discounted [TO CONFIRM: items excluded from discounts]. The source files do set these floors:

- No plan price below ₱20, and no medical representative fee between ₱0 and ₱20.
- No voucher batch with a clinic price above the patient price.
- No refund of eMCR vouchers, and no exchange of vouchers for cash.

## How a price exception is requested and recorded

How a price exception is requested, and who approves it, is not in the source files [TO CONFIRM: request and approval process]. The source files show how each exception is applied and recorded:

1. **Extra days for a clinic (goodwill or trial extension).** A platform admin opens the clinic in the platform console and uses "Extend the current period". The days (1–365) are added from the current end, or from today if the period has already ended, and an expired subscription becomes active again. The change is written to the clinic's audit log with the platform admin's email and the old and new end dates. The system accepts a written reason, but the console does not ask for one [TO CONFIRM: whether a reason must be recorded].
2. **A different voucher price for one clinic.** A platform admin sets the face value or wholesale price on a new voucher batch; the batch records the prices, the platform admin and optional notes (up to 500 characters). Steps are in "Issuing eMCR Activation Voucher Batches".
3. **A change to the price list.** A platform admin saves new prices in Platform → Configuration; the change applies to every new checkout and is audit-logged with the old and new values.
4. **A refund.** Issued in PayMongo [TO CONFIRM: by whom]; the system reverses the paid time as described in "Refunds and chargebacks".

Sources: app/api/platform/tenants/[id]/route.ts; components/platform/ClinicActions.tsx; app/api/platform/vouchers/route.ts; app/api/platform/configuration/route.ts.

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Products and Services Catalogue; Sales Playbook; Customer Support Playbook; Invoicing and Expenses Procedure; Standard Contract Terms Summary; Issuing eMCR Activation Voucher Batches; Handling a Clinic Support Request |

## Open questions

1. [TO CONFIRM: role titles] for sales and finance.
2. [TO CONFIRM: live price] for every line of the price list, as set in Platform → Configuration; and [TO CONFIRM: live price and whether it is published or quoted] for Enterprise.
3. [TO CONFIRM: yearly wording (contradiction 9)].
4. [TO CONFIRM: costs and target margins].
5. [TO CONFIRM: where the voucher price is set (contradiction 8)]: lib/emcr/activation.ts fixes ₱80 and ₱60 in code; lib/platform-config.ts lets a platform admin change both; app/api/platform/vouchers/route.ts also allows a price per batch.
6. [TO CONFIRM: discount policy]: discount sizes, who may approve each, and conditions.
7. [TO CONFIRM: invoice payment terms] for Enterprise.
8. [TO CONFIRM: how plan changes are charged (contradiction 1); trial days (contradiction 2)].
9. [TO CONFIRM: non-profit terms].
10. [TO CONFIRM: refund authority and limit] and [TO CONFIRM: refund policy (contradiction 11)].
11. [TO CONFIRM: items excluded from discounts].
12. [TO CONFIRM: request and approval process] for price exceptions, [TO CONFIRM: whether a reason must be recorded] for period extensions, and [TO CONFIRM: by whom] refunds are issued.
13. Voucher batches can be made for an eMCR plan "basic" or "plus", but both unlock the same features today ("`plus` is reserved for extras", lib/emcr/activation.ts) and no separate price for "plus" exists.
14. The medical representative activation fee falls back to a server setting when nothing is saved in Platform → Configuration (lib/platform-config.ts), so the live value may not be ₱0.
15. lib/subscription-page.ts shows payment history with "USD" when a payment has no currency (contradiction 13), although all prices are in pesos.
16. [TO CONFIRM: owner role], effective date and review date.
17. [TO CONFIRM: trial length (contradictions 12 and 42)]: terms page and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts gives 7 days, and the trial emails in lib/automations/trial-expiration.ts say "Your 7-day trial period".
18. Meaning of ₱0 for medical representative fees: lib/platform-config-schema.ts treats a ₱0 team seat fee as "not sold" and a ₱0 monthly fee as "free" (contradiction 60). Whether booking is free for reps is also open: MOBILE_API.md says the default fee of ₱0 makes booking free, rep/README.md says booking needs a rep plan or a team seat (contradiction 19).
19. Taxes: the terms page says the clinic is responsible for applicable taxes, while the faq page says "The price you see is the price you pay" (contradiction 51). Whether list prices include VAT is open.
