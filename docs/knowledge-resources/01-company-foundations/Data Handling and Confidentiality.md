# Data Handling and Confidentiality

## Summary

The Data Handling and Confidentiality policy describes which data DevCom Digital holds through MyClinicSoft and eMCR (Electronic MyClinic Record), how sensitive each kind is, who may share it, how long it is kept, which outside services may receive it, and where a suspected data incident is reported. It applies to everyone at DevCom Digital who works with customer, patient, financial or partner data [TO CONFIRM: whether the policy also binds contractors and AI employees]. The Data Privacy Act of 2012 (RA 10173) is a hard constraint on all data handling. For patient records that clinics enter, each clinic is the personal information controller and DevCom Digital is its personal information processor; DevCom Digital is the controller for clinic staff accounts, eMCR accounts, billing information and enquiries. Patient data is never sold, never used for DevCom Digital's own marketing and never used to train AI models.

## Data categories: customer and patient data

Customer and patient data at DevCom Digital is the data clinics and patients put into MyClinicSoft and eMCR (source: Privacy Policy, updated 2026-10-22).

| Data | Examples | DevCom Digital's role |
|---|---|---|
| Patient records entered by a clinic | Consultations, diagnoses, prescriptions, lab results, uploaded documents | Processor (the clinic is the controller) |
| Clinic staff accounts | Name, email, phone, role, sign-in security settings | Controller |
| Clinic details and settings | Clinic name, configuration | Controller |
| eMCR and online booking data | Mobile number (verified by a one-time code), name and date of birth, dependants such as children, booking requests and check-ins, push-notification tokens | Controller for eMCR accounts |
| Collected automatically | IP address, browser or device information, audit logs of who viewed or changed records, error reports | Controller |
| Enquiries | Messages sent to DevCom Digital | Controller |

Patient records can include health information, which is classed Restricted (see "Confidentiality levels"). Clinics may keep records of patients under 18; in eMCR, accounts are held by adults, and a dependant's access passes to the dependant at 18.

## Data categories: employee, financial and partner data

Employee, financial and partner data at DevCom Digital is held alongside the customer data described above.

| Category | Examples | Source |
|---|---|---|
| Employee data | DevCom Digital's own staff records: [TO CONFIRM: the source files contain no HR material]. Platform admin access is granted by an email allowlist | lib/platform-auth.ts |
| Financial data | Billing records for each clinic's subscription; BIR sales invoices issued to clinics; subscription payments through PayMongo; clinics' own payment account keys (Xendit, Maya Business, PayMongo), stored with extra encryption | Privacy Policy; lib/platform-invoice.ts; security page |
| Clinic financial data (processed for clinics) | Patients' bills, payments, PhilHealth and HMO claims | Privacy Policy; COMPANY_PROFILE.md |
| Partner data | Profiles of medical representatives using MyClinicSoft Rep; third-party lab integration keys | scripts/delete-tenant.ts; docs/LOCAL_DEV_DATABASE.md |
| Supplier data | Contracts with sub-processors: [TO CONFIRM: where supplier contracts are kept] | Privacy Policy ("under contract") |

## Confidentiality levels

The confidentiality levels below are used for DevCom Digital's documents and data. The source files do not define a company classification scheme, so the definitions are proposed [TO CONFIRM: owner approval of the four levels and their handling rules]. The knowledge library already labels each document Public, Internal or Confidential.

| Level | Meaning (proposed) | Examples from the business |
|---|---|---|
| Public | Published, or approved for anyone to read | Pricing page, Terms of Service, Privacy Policy, security page, Customer FAQ |
| Internal | For DevCom Digital staff only; no personal data | Systems Overview, procedures such as "Restoring the Database After an Incident", this policy |
| Confidential | Commercially sensitive; only named roles may read it | "Pricing and Discount Rules" (wholesale voucher price, clinic commission, discount authority), "Standard Contract Terms Summary", support requests from clinics [TO CONFIRM] |
| Restricted | Personal or health data, or anything that unlocks it | Patient records; production database dumps and backup files ("real patient data and password hashes"); production settings and keys; audit-log archives |

Production database dumps must be stored encrypted, never committed to the code repository or shared, and deleted when no longer needed (source: docs/BACKUP_RESTORE.md; docs/LOCAL_DEV_DATABASE.md).

## Who may share what with whom

Sharing rules at DevCom Digital follow the Privacy Policy and the product's access controls.

| Data | May be shared with | Rule |
|---|---|---|
| A clinic's patient records | The clinic's own staff, by role; the service providers listed in "Sending data outside the company" | Processed only on the clinic's instructions. Staff of one clinic can never see another clinic's patients |
| Any personal data | Authorities | Only to comply with a law, court order or lawful request; or as part of a merger or sale of the business, with the Privacy Policy still applying |
| A patient's request about clinic records | The clinic | Patients contact the clinic first; DevCom Digital helps the clinic respond |
| A clinic's data, viewed by DevCom Digital | Platform admins | "View as clinic" opens a read-only session and writes an audit log entry. [TO CONFIRM: when a platform admin may use it, for example only for an open support request] |
| A patient's data export | The requesting clinic's administrator or doctor | The export does not reveal which other clinics hold the patient |
| Security issue details | Nobody outside DevCom Digital until fixed | Reporters are asked not to share details publicly until the issue is fixed (security page) |
| Confidential documents | The roles named on each document | [TO CONFIRM: who approves access] |

Accounts must not be shared between staff (Terms of Service, "Accounts").

## Rules for personal data: collection

Personal data collection at DevCom Digital is limited to the purposes in the Privacy Policy: providing the Service, verifying identity and keeping accounts secure, sending service messages (reminders, sign-in codes, receipts), support, detecting and fixing errors and misuse, and legal obligations.

| Rule | Source |
|---|---|
| Each clinic must have a lawful basis, and patient consent where required, for the data it enters and the messages it sends | Terms of Service, "Clinic Responsibilities" |
| Promotional text messages need the patient's consent and carry a stop link | docs/SMS_TWILIO.md |
| The AI scribe sends data to Anthropic only when a clinic turns the scribe on; drafts must be reviewed by a licensed professional | Privacy Policy; Terms of Service |
| Cookies are limited to those needed to run the Service; no advertising or third-party analytics cookies | Privacy Policy |
| Credentials, sign-in codes and device tokens are never copied into a clinic's in-app backup | lib/backups.ts |

## Rules for personal data: retention

Retention periods for personal data at DevCom Digital are set in code and in the legal pages.

| Data | Retention | Source |
|---|---|---|
| Clinic records | As long as the clinic's account is active; the clinic decides its own retention periods within the law | Privacy Policy |
| Clinical and billing records (archive flag) | Weekly job (Sunday 02:00 Asia/Manila; 18:00 UTC Saturday) flags appointments, visits, lab results and prescriptions as archived after 365 days, and paid or refunded invoices and documents after 730 days. Nothing is deleted; patients are never archived. Clinics can switch the job off (on by default) | lib/automations/data-retention.ts; vercel.json |
| Audit log | 90 days in the database, then archived for 5 years in private Vercel Blob storage, then deleted. Nothing moves until a Blob store is connected [TO CONFIRM (contradiction 32)] | lib/audit-archive.ts |
| SMS delivery log | 60 days, with no message bodies | docs/SMS_TWILIO.md |
| eMCR accounts | Until the patient asks to close them [TO CONFIRM: close-account path] | Privacy Policy |
| Backups and logs | "Overwritten on a rolling basis" [TO CONFIRM: production backup policy (contradiction 30)] | Privacy Policy |
| BIR sales invoices to clinics | Kept when a clinic is deleted; cancelled, never deleted [TO CONFIRM: retention period] | scripts/delete-tenant.ts; lib/platform-invoice.ts |
| Clinic in-app backups | Until a clinic administrator deletes them; at most 3 per clinic | lib/backups.ts |

## Rules for personal data: deletion

Deletion of personal data at DevCom Digital follows two documented routes, each with its own procedure.

| Request | Commitment | Procedure |
|---|---|---|
| A closed clinic's data | Deleted within 30 days of a written request from a clinic administrator, "except for anything the law requires us to keep" | "Deleting a Closed Clinic's Data" |
| One patient's data at one clinic | Erased or anonymised by the clinic, "where the law allows" | "Handling a Patient Data Erasure Request" |
| An eMCR account | [TO CONFIRM: no close-account path found] | none yet |

Data is not deleted because a payment was missed (Terms of Service, "Expired subscriptions").

## Rules for personal data: copies for development and testing

Copies of production data at DevCom Digital are handled under the rules in docs/LOCAL_DEV_DATABASE.md and docs/BACKUP_RESTORE.md.

1. Local development uses an anonymised copy of production. The scrub replaces names, contacts, credentials, files and secrets, and fails its self-check if it finds a real email, Philippine mobile number or Cloudinary link. The local database is still treated as sensitive, because free text can contain a name.
2. Production is touched only on purpose, through `pnpm prod <script>`, which shows the target cluster and asks for confirmation.
3. Production backup files contain real patient data and password hashes. They are kept on an encrypted disk, never committed or shared, and deleted once the local database is refreshed.
4. Error reports sent to Sentry are scrubbed before they leave the server or browser: request bodies, cookies, auth headers and query strings are dropped, user data is reduced to an opaque id, and patient fields are filtered (README.md).

## Sending data outside the company

Data leaves DevCom Digital only through the service providers below, which process it under contract (Privacy Policy). Some are based outside the Philippines, mainly in the United States; DevCom Digital chooses providers that protect data to a standard comparable to the Data Privacy Act.

| Provider | Purpose |
|---|---|
| Vercel | Application hosting (Vercel Blob also holds audit-log archives) |
| MongoDB Atlas | Database hosting |
| Cloudinary | Uploaded files and documents |
| Twilio | SMS reminders and one-time sign-in codes (not yet live) |
| Resend (listed as "Email delivery provider") | Transactional email |
| Anthropic | AI scribe drafts, only when a clinic turns the scribe on |
| Jitsi (meet.jit.si) | Teleconsult video, only when a clinic uses it |
| PayMongo; Xendit, Maya Business | Subscription payments; patient bill payments for clinics that connect their own account |
| Expo and web push services | Notifications |
| Sentry | Error monitoring (scrubbed) |

Upstash Redis, Cloudflare Turnstile and the NLM RxNav service are configured but not listed in the Privacy Policy [TO CONFIRM (contradiction 33)]. Staff use the role mailboxes support@, legal@ and privacy@myclinicsoft.solutions for external contact. [TO CONFIRM: rules for personal email, chat tools, removable media and AI tools not listed above.]

## Reporting a suspected data incident

A suspected data incident at DevCom Digital is any event where personal data may have been lost, changed, deleted or seen by someone who should not see it. The steps for handling one are in "Responding to a Suspected Data Breach".

| Who reports | Where | How fast |
|---|---|---|
| DevCom Digital staff | The Data Protection Officer, privacy@myclinicsoft.solutions [TO CONFIRM: internal reporting channel] | [TO CONFIRM: internal deadline, for example immediately on discovery] |
| A clinic suspecting unauthorised access | legal@myclinicsoft.solutions (Terms of Service, "Accounts") | "Promptly" |
| Anyone outside the company reporting a security issue | support@myclinicsoft.solutions, subject "Security report" (security page) | No deadline stated |

The time of discovery is recorded at once, because the deadline for notifying the National Privacy Commission (NPC) runs from it. If a breach is likely to put people at real risk, DevCom Digital notifies the affected clinics and, where the law requires, the NPC. Encryption measures: TLS in transit and additional AES-256 encryption of sensitive fields; encryption of the database at rest [TO CONFIRM (contradiction 29)].

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role, for example the Data Protection Officer] | 0.1 (draft) | [TO CONFIRM] | [TO CONFIRM] | Responding to a Suspected Data Breach; Deleting a Closed Clinic's Data; Handling a Patient Data Erasure Request; Handling an SMS Opt-Out; Restoring the Database After an Incident; Systems Overview; Standard Contract Terms Summary; Pricing and Discount Rules; Teams and Responsibilities |

## Open questions

1. Scope: does the policy also bind contractors and AI employees?
2. Employee data: the source files contain no HR material. What staff data does DevCom Digital hold, and how long is it kept?
3. Where are contracts with sub-processors kept?
4. Confidentiality levels: does the owner approve the four levels, their meanings and their handling rules as proposed?
5. Are support requests from clinics Confidential or Internal?
6. When may a platform admin use "View as clinic" (for example only for an open support request)?
7. Who approves access to Confidential documents?
8. Audit-log retention (contradiction 32): the Privacy Policy says "Backups and logs are overwritten on a rolling basis", while lib/audit-archive.ts and docs/BACKUP_RESTORE.md keep audit-log archives for 5 years. Which wording is correct? Is the Vercel Blob store connected in production?
9. eMCR accounts: the Privacy Policy says they are kept "until you ask us to close them". docs/PUBLIC_SITE_FOLLOWUPS.md asks to "Confirm there is a close-account path, in-app or by support"; none was found. What is the path?
10. Production backups (contradiction 30): the Privacy Policy promises "Regular backups", but docs/BACKUP_RESTORE.md says Cloud Backup "Requires an M10 or larger cluster" and lib/backups.ts refers to "the free tier's 512 MB". What is the actual backup policy and retention?
11. How long are BIR sales invoices kept? The source files name RA 11976 and RR 7-2024 (lib/bir.ts) but give no retention period.
12. Sub-processor list (contradiction 33): the Privacy Policy names an "Email delivery provider" (Resend in lib/email.ts) and omits Upstash, Cloudflare Turnstile, Vercel Blob and NLM RxNav, while listing Twilio, which is not yet live (docs/SMS_TWILIO.md).
13. What are the rules for personal email, chat tools, removable media and AI tools not listed as sub-processors?
14. Internal incident reporting: which channel and deadline do staff use?
15. Encryption at rest (contradiction 29): the security page says "the database is encrypted at rest"; docs/PUBLIC_SITE_FOLLOWUPS.md says to "Confirm MongoDB Atlas encryption at rest is on for the production cluster."
16. NPC registration and a named Data Protection Officer are open owner decisions (docs/PUBLIC_SITE_FOLLOWUPS.md).
17. Owner role, effective date and review date for this policy.
18. Out of date: the FAQ answers "Is MyClinicSoft compliant with the Data Privacy Act?" with "Yes.", while docs/PUBLIC_SITE_FOLLOWUPS.md records that the unbacked "DPA compliant" claim was removed. Wording rule used here: "built for the Data Privacy Act of 2012 (RA 10173)" (contradiction 46).
19. Out of date: the security page lists "Data retention rules that clear records you no longer need", but lib/automations/data-retention.ts only flags records as archived ("they stay in the database") (contradiction 47).
20. Incident reporting channels differ: the Terms of Service send suspected unauthorised access to legal@myclinicsoft.solutions, and the security page sends security reports to support@myclinicsoft.solutions. Which one should staff watch, and should both be forwarded to the Data Protection Officer? (contradiction 49)
