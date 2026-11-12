# Standard Contract Terms Summary

Confidentiality: Confidential. Available to the roles that handle contracts [TO CONFIRM: which roles].

## Summary

The Standard Contract Terms Summary sets out, clause by clause, the terms DevCom Digital uses with its customers, for staff who answer contract questions or prepare Enterprise deals. The only contract in the source files is the MyClinicSoft Terms of Service (updated 2026-10-22), which covers both clinics using MyClinicSoft and patients using eMCR (Electronic MyClinic Record); the Privacy Policy of the same date describes how data is handled under it. No Enterprise contract template exists in the source files, so Enterprise terms are open. Key terms: subscriptions are paid in advance and do not renew on their own, payments are non-refundable except where Philippine law requires otherwise, liability is capped at the fees paid in the 12 months before the event, and a closed clinic's data is deleted within 30 days of a written request. The summary is a reading aid, not legal advice; the published Terms of Service govern.

## Contract type: Terms of Service for clinics

The Terms of Service for clinics is the standard agreement for every clinic on the Free trial, Basic, Professional or Enterprise plan. It is published at www.myclinicsoft.solutions/terms and is governed by the laws of the Republic of the Philippines. Prices are in "Products and Services Catalogue".

| Term | What the Terms of Service say |
|---|---|
| When used | Every clinic account. "By creating an account or using the Service, you agree to these Terms. If you use the Service on behalf of a clinic, you confirm that you may bind that clinic to them." |
| Licence | "a non-exclusive, non-transferable right to use the Service for your clinic's own operations"; no reselling, sublicensing, reverse engineering or unlawful use |
| Term length | One billing period, monthly or yearly. The Free trial lasts 14 days [TO CONFIRM: trial length (contradictions 12 and 42)] |
| Renewal | No automatic renewal: the clinic's subscription page states "Payments are one-off and don't renew on their own" (components/admin/SubscriptionClient.tsx) |
| Termination by the clinic | "You can stop using the Service at any time." |
| Termination by DevCom Digital | Suspension or closure for "Serious or repeated violation of these Terms", "Non-payment, after the grace period above" or "Fraudulent or illegal activity"; "Where we can, we will give notice and a chance to export your data first." |
| Payment terms | See "Terms of Service: payment and refunds" |
| Liability cap | See "Terms of Service: liability, indemnity and disputes" |
| Data protection clause | See "Terms of Service: data protection" |

## Terms of Service: payment and refunds

The payment terms in the Terms of Service ("Subscription & Billing") apply to every paid plan.

| Term | Exact wording |
|---|---|
| Billing | "Subscriptions are billed in advance, monthly or yearly, at the prices on our pricing page in Philippine pesos" |
| Price changes | "We may change prices with at least 30 days' notice; a change applies from your next billing period" |
| Taxes | "You are responsible for applicable taxes" [TO CONFIRM: whether prices include VAT (contradiction 51)] |
| Refunds | "All payments are final and non-refundable, including for unused time in a billing period, downgrades, and accounts closed early, except where Philippine law requires otherwise." [TO CONFIRM (contradiction 11)] |
| Expiry | The account "becomes read-only for a 7-day grace period so you can still view and export your records. After that, access is suspended until you subscribe again. Your data is not deleted because a payment was missed." |
| Free trial | "No credit card is required to start"; "Your data carries over if you subscribe" |

Subscriptions are paid through PayMongo; "Enterprise customers can also pay by invoice" (FAQ). How plan changes are charged is open [TO CONFIRM: how plan changes are charged (contradiction 1)].

## Terms of Service: data protection

The data protection terms in the Terms of Service make each clinic responsible for the patient data it enters and limit DevCom Digital to providing the Service.

| Term | Exact wording |
|---|---|
| Controller | "Your clinic is the personal information controller for the patient data it enters." |
| Clinic duties | "Comply with the Data Privacy Act of 2012 (RA 10173) and other applicable healthcare laws"; "Have a lawful basis, and patient consent where required, for the data you enter and the messages you send"; "Keep patient data confidential and limit staff access to what each role needs" |
| Ownership and use | "Your clinic owns the data it enters. We process it only to provide the Service, as described in our Privacy Policy." |
| Backups | "We keep backups of the Service, but you should regularly export the records your clinic must keep." [TO CONFIRM (contradiction 30)] |
| After termination | "After an account is closed, a clinic administrator can ask us in writing to delete the clinic's data, and we will do so within 30 days of the request, except for anything the law requires us to keep." |
| Account security | Clinics must keep credentials secure, not share accounts between staff, and "Tell us promptly at legal@myclinicsoft.solutions if you suspect unauthorized access" |

The Privacy Policy adds that DevCom Digital acts as the clinic's "personal information processor" and lists the sub-processors; details are in "Data Handling and Confidentiality".

## Terms of Service: liability, indemnity and disputes

The liability, indemnity and dispute terms in the Terms of Service are worded as follows.

| Term | Exact wording |
|---|---|
| Liability cap | "Our total liability for any claim is limited to the fees your clinic paid us in the 12 months before the event giving rise to the claim." |
| Excluded damages | "The Service is provided "as is." To the extent the law allows, we are not liable for indirect, incidental, special, or consequential damages, or for lost profits or data" |
| Indemnity | "You agree to indemnify DevCom Digital against claims, damages, and expenses arising from your clinic's use of the Service, the data you enter, or your violation of these Terms or applicable law." |
| Clinical use | "The Service is a records and workflow tool, not a medical device, and does not give medical advice." AI drafts must be reviewed: "a licensed professional must review them before they are saved, signed, or relied on." |
| Availability | "We work to keep the Service available but do not guarantee uninterrupted service." |
| Changes to the terms | "We will tell clinic administrators about material changes by email or in the Service at least 15 days before they take effect." |
| Disputes | "Both sides will first try to settle a dispute in good faith by writing to the other; if that fails within 30 days, it goes to the proper courts of the Philippines." |

## Contract type: eMCR terms for patients

The eMCR terms are a section ("eMCR Patient App") of the same Terms of Service and apply to every patient who uses eMCR. The eMCR app links to them from its More tab. The voucher price is in "Products and Services Catalogue".

| Term | What the Terms of Service say |
|---|---|
| When used | Every eMCR account. "Clinics do not pay for eMCR." |
| Term length | "Each voucher activates the eMCR account for one year; renewals add a year to the current expiry" |
| Renewal | By a new voucher, "bought for cash at a participating clinic" |
| Termination | [TO CONFIRM: no eMCR-specific termination clause; the Privacy Policy keeps eMCR accounts "until you ask us to close them"] |
| Payment terms | "Vouchers are non-refundable and cannot be exchanged for cash" |
| Free access | "You can always view a basic summary of your own records without activation" |
| Liability cap | [TO CONFIRM: the cap is worded as "the fees your clinic paid us", which does not fit patients] |
| Data protection | "A clinic remains responsible for the records it keeps about you; contact the clinic to correct them". DevCom Digital is the controller for eMCR accounts (Privacy Policy) |

## Contract type: Enterprise contract

The Enterprise contract is the agreement for clinics on the Enterprise plan, which is sold through "Talk to sales". No Enterprise contract template exists in the source files.

| Term | What the source files say |
|---|---|
| When used | Enterprise plan, "For large and multi-doctor practices" (pricing page) |
| Term length and renewal | [TO CONFIRM] |
| Termination | [TO CONFIRM] |
| Payment terms | "Enterprise customers can also pay by invoice" (FAQ); invoice due period [TO CONFIRM] |
| Support | "Support terms agreed in your contract" (pricing page); hours and response times are an open owner decision (docs/PUBLIC_SITE_FOLLOWUPS.md) |
| Liability cap | [TO CONFIRM: whether the Terms of Service cap applies or is negotiated] |
| Data protection clause | [TO CONFIRM: whether a separate data processing agreement is used] |

Until a template exists, the Terms of Service is the only written agreement [TO CONFIRM: whether Enterprise clinics sign anything beyond the Terms of Service].

## Terms that may be negotiated and by whom

Negotiable terms at DevCom Digital are only partly described in the source files.

| Term | Negotiable? | Who decides |
|---|---|---|
| Enterprise support hours and response times | Yes: "agreed in your contract" | [TO CONFIRM: role] |
| Enterprise payment by invoice | Yes, for Enterprise customers | [TO CONFIRM: role] |
| Enterprise custom integrations | "Custom integrations with our team" (pricing page) | [TO CONFIRM: role] |
| Liability cap | [TO CONFIRM] | [TO CONFIRM: role] |
| Price, discounts and trial extensions | See "Pricing and Discount Rules" | See "Pricing and Discount Rules" |

## Terms that may never be changed

Terms that may never be changed are not listed in the source files [TO CONFIRM: the fixed terms]. Clauses the owner may wish to confirm as fixed, because other documents and the product depend on them:

| Clause | Why it matters |
|---|---|
| The clinic is the personal information controller for patient data | The Privacy Policy and the erasure tools are built on it |
| Patient data is not sold, not used for DevCom Digital's marketing and not used to train AI models (Privacy Policy) | Public promise |
| AI drafts must be reviewed by a licensed professional | Clinical safety |
| Governing law of the Republic of the Philippines | |
| No refunds "except where Philippine law requires otherwise" | Stated on the pricing page, FAQ and Terms of Service |

## How a contract is sent, signed and stored

Contracts at DevCom Digital are handled as follows, as far as the source files describe.

1. The Terms of Service and Privacy Policy are published on the website with an "updated" date (currently 2026-10-22). The website footer, the resources page and the eMCR app link to them.
2. A clinic accepts the Terms of Service by creating an account or using the Service. No signature, checkbox or stored acceptance record was found in the source files [TO CONFIRM: whether acceptance is recorded].
3. Material changes are announced to clinic administrators as set out in the "Changes to the terms" row of "Terms of Service: liability, indemnity and disputes". A way to email all clinic administrators still needs building (docs/PUBLIC_SITE_FOLLOWUPS.md).
4. Earlier versions of the terms exist only in the code repository history [TO CONFIRM: whether signed or archived copies are kept elsewhere].
5. Enterprise contracts: [TO CONFIRM: how they are sent, who signs for DevCom Digital, and where signed copies are stored].
6. Questions about the terms go to legal@myclinicsoft.solutions.

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Data Handling and Confidentiality; Products and Services Catalogue; Pricing and Discount Rules; Deleting a Closed Clinic's Data; Customer FAQ; Sales Playbook |

## Open questions

1. Which roles handle contracts and may read this document?
2. Refunds (contradiction 11): the Terms of Service, pricing page and FAQ say "All payments are final and non-refundable … except where Philippine law requires otherwise", while lib/subscription.ts removes paid time when PayMongo reports a full refund or chargeback.
3. Plan changes (contradiction 1): the pricing page says changes "take effect immediately"; the FAQ says "The new plan starts when it's paid; time left on the old plan isn't prorated or refunded"; lib/subscription-period.ts converts days left "at the two plans' daily prices".
4. Backups (contradiction 30): the Terms of Service say "We keep backups of the Service"; docs/BACKUP_RESTORE.md says Cloud Backup "Requires an M10 or larger cluster", and lib/backups.ts refers to "the free tier's 512 MB".
5. eMCR: is there a termination clause for patients, and how does a patient close an eMCR account?
6. eMCR: the liability cap refers to "the fees your clinic paid us". What cap, if any, applies to patients?
7. Enterprise contract: term length, renewal, termination, invoice due period, support terms, liability cap and data protection clause. Is there a template or a separate data processing agreement?
8. Do Enterprise clinics sign anything beyond the Terms of Service?
9. Who may negotiate Enterprise support, invoice payment, custom integrations and the liability cap?
10. Which terms may never be changed?
11. Is clinic acceptance of the Terms of Service recorded anywhere?
12. Are earlier versions of the terms archived outside the code repository?
13. How are Enterprise contracts sent, who signs them for DevCom Digital, and where are signed copies stored?
14. Owner role, effective date and review date for this document.
15. Clinic accounts reporting suspected unauthorised access are sent to legal@myclinicsoft.solutions in the Terms of Service, while the security page asks for security reports at support@myclinicsoft.solutions (contradiction 49).
16. [TO CONFIRM: trial length (contradictions 12 and 42)]: the terms page and app/api/tenants/onboard/route.ts give 14 days; scripts/onboard-tenant.ts and the trial emails in lib/automations/trial-expiration.ts say 7 days.
17. [TO CONFIRM: whether prices include VAT (contradiction 51)]: the Terms of Service say "You are responsible for applicable taxes"; the FAQ says "The price you see is the price you pay".
