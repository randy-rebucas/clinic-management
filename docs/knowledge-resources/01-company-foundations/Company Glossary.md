# Company Glossary

## Summary

The Company Glossary lists the terms, abbreviations, product names, role names, system names and customer-segment names used at DevCom Digital and in MyClinicSoft. It is for every colleague who writes to customers, answers support requests or reads the technical files. Each table gives the official term, what it means, and the words it must not be confused with; where the source files use two words for one thing, the official term comes first and the other is listed as an alias. Prices, plan limits and periods are not repeated here: they are in the Products and Services Catalogue.

## Company and product names

The company and product names below are the official spellings.

| Term | Meaning | Not to be confused with |
|---|---|---|
| DevCom Digital | The company: a business registered in the Philippines that builds and runs MyClinicSoft and eMCR | "Devcom", "DevCom" (wrong spellings) |
| MyClinicSoft | The clinic management platform: the staff web app, the public website and the services behind the apps | "MyClinic Soft", "Clinic Management System" (alias in DESIGN.md), "myclinicsoft" (the project name only) |
| myclinicsoft | The project name used in file names and project documents | MyClinicSoft (the product) |
| eMCR | Electronic MyClinic Record: the patient app for clinics that use MyClinicSoft. Written "eMCR (Electronic MyClinic Record)" on first use | "EMCR", "e-MCR", "Electronic Medical Clinic Record", "the patient portal" (removed web portal) |
| MyClinicSoft Rep | The mobile app for medical representatives who visit clinics | "rep portal" (removed web portal), "med rep app" |
| MyClinicSoft public API | The clinic's REST API at `/api/v1`, with webhooks, for connecting other systems | "open API"; the mobile API used by the two apps (MOBILE_API.md) |
| Webhook | A signed message MyClinicSoft sends to a clinic's own system when something happens, such as a booked appointment or a paid invoice | Push notification |
| Platform console | The part of MyClinicSoft where platform admins manage clinics, support, eMCR vouchers, announcements and configuration (`/platform`) | Clinic Admin pages (`/admin`) |
| Help Center | The public support page (`/support`) | Admin → Support (where requests are opened) |

## Plans and billing terms

The plan and billing terms below are defined here; their prices and limits are in the Products and Services Catalogue.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Free trial | The free plan every new clinic starts on, for a fixed number of days. Shown as "Trial" inside the app | A demo (demos are not offered; the trial replaces them) |
| Basic, Professional, Enterprise | The three paid MyClinicSoft plans, cheapest first | eMCR plans; rep plans |
| Paid plan | Basic, Professional or Enterprise | Free trial |
| Billing cycle | Monthly or yearly payment for a paid plan | Billing period (the time one payment covers) |
| Yearly billing | Paying for a year at once, at a lower price than twelve monthly payments | "Annual plan" (alias in the FAQ) |
| Grace period | The read-only days after a subscription ends, before access is suspended | Free trial |
| Plan limits | The number of patients, doctors, staff accounts, appointments and storage a plan allows | Rate limit (requests a minute on the public API) |
| Talk to sales | The Enterprise button on the pricing page; it leads to the contact page | Support request |
| Platform → Configuration | The platform console page where platform admins set prices and business settings | Clinic Settings |
| Sales invoice (BIR) | The tax document issued for a sale of services under RA 11976 and RR 7-2024 | "Official receipt" (no longer a primary document) |
| Payment link | A link a clinic sends so a patient can pay a bill online | Subscription checkout |

## Role names

The role names below are the official clinic and company roles.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Administrator (clinic administrator) | A clinic user with full access within one clinic; "owner" counts as administrator | Platform admin |
| Doctor | Clinical staff: patient care, visits and prescriptions | |
| Nurse | Clinical staff: patient care and lab results | |
| Medical technologist | Laboratory staff who receive lab requests and enter results | |
| Receptionist | Front-desk staff: appointments and patient management; hands out medicines at checkout | |
| Accountant | Financial staff: billing and invoices | "Finance and billing staff" (alias in PRODUCT.md) |
| Medical representative (rep) | Pharmaceutical and medical-device representatives who visit clinics and their doctors [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device (contradiction 18)] | "med rep", "medrep" (not used in documents) |
| Patient | A person a clinic treats; also an eMCR account holder | |
| Family manager (guardian) | A person who manages a dependant's records in eMCR | Emergency contact |
| Dependant | A person, such as a child, whose eMCR access a family manager holds; a minor's access passes to them at 18 | |
| Platform admin | A person at DevCom Digital who runs MyClinicSoft itself, not one clinic | Clinic administrator |
| Data Protection Officer (DPO) | DevCom Digital's privacy contact; no person is named | |
| Support team | The people who answer support requests from clinics and patients | Platform admin (the role in the app that answers them) |

## Customer segments

The customer segments below are the names the source files use for buyers and users.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Clinic | A customer account in MyClinicSoft; one clinic location runs as one account | "Tenant" (technical files only) |
| Independent clinic | A single, owner-run practice | |
| Small clinic | The audience of the Basic plan; the Products and Services Catalogue gives the doctor count | |
| Growing clinic | The audience of the Professional plan | |
| Large and multi-doctor practice | The audience of the Enterprise plan | Healthcare network (a multi-clinic group; not yet one account) |
| Clinic owners and administrators | The people who decide and buy | Clinic administrator (the role) |
| Participating clinic | A clinic that uses MyClinicSoft and is connected to eMCR | |

## Clinic workflow terms

The clinic workflow terms below describe how clinics book, see and treat patients in MyClinicSoft.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Online booking | Patients book through the clinic's booking page or eMCR | Self check-in |
| Queue | The clinic's live line of waiting patients, with QR check-in and display screens | Waitlist |
| Waitlist | A list of patients waiting for an opening when a doctor is fully booked | Queue |
| Self check-in | A patient checks in by scanning the clinic's check-in QR | Online booking |
| Visit | One encounter with a patient: notes, vitals, diagnoses and treatment plan | Appointment (the booking) |
| SOAP notes | Visit notes in the Subjective, Objective, Assessment, Plan format | |
| AI visit notes | Customer-facing name for drafts of the visit note, diagnoses and prescription made from a dictated consult; a licensed professional reviews them | "AI scribe" (the name in the terms, privacy policy and technical files) |
| Teleconsult | A video visit booked through the patient app | "Telemedicine", "video consult" |
| E-prescription | A prescription written in MyClinicSoft, with interaction checks | "e-Rx" (patient app only) |
| Dispense | Recording the medicines handed to a patient | |

## Clinic records and programme terms

The clinic records and programme terms below describe the records, programmes and settings clinics keep in MyClinicSoft.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Referral | Sending a patient to a specialist and following the outcome | Referral rewards (membership) |
| Document request | A patient's request for medical records, a medical certificate or a clinical abstract | Support request |
| Membership | A clinic's loyalty programme: tiers, points and bill discounts | eMCR activation |
| Location code | A short clinic code (2–6 letters or digits) used in eMCR login IDs | Clinic subdomain |
| Self-registered record | A patient record made from a public form, kept out of eMCR claiming until staff save it | |
| In-app backup | A copy of one clinic's data that the clinic takes from inside MyClinicSoft | Database backups run by DevCom Digital |
| Audit log | The record of who viewed or changed records | Error reports |

## eMCR terms

The eMCR terms below describe the patient app.

| Term | Meaning | Not to be confused with |
|---|---|---|
| eMCR account | One verified phone number; the clinics' patient records are attached to it | A clinic's patient record |
| Activation | Turning on the paid eMCR features for a year | Sign-in |
| Activation voucher (voucher) | A printed voucher sold at a clinic counter, carrying a 12-character activation code | "Coupon", "promo code" |
| Activation code | The code on the voucher that the patient types in eMCR | Sign-in code (OTP) |
| Voucher batch | A set of activation vouchers issued to one clinic, numbered EV-YYYYMMDD-NNNN | |
| Clinic invite (app invite) | A one-time code or link from the clinic that brings a patient into eMCR | Activation code |
| Login ID | A sign-in name built from the clinic's location code, the patient's initials and birth date; it is not a mailbox | Email address |
| Health Summary | The eMCR screen that merges a patient's record from every clinic, tagged with the clinic that recorded each item; it can be shared by a revocable link | Clinic patient record |
| App Lock | Optional biometric or screen-lock check when eMCR opens | Two-factor sign-in |

## Medical representative terms

The medical representative terms below describe the MyClinicSoft Rep app.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Visit (rep) | A medical representative's visit to a clinic, booked in the clinic's rep hours or logged by the rep | Visit (patient encounter) |
| Visit log | The rep's own record of visits; free to use | Clinic booking |
| Rep hours (visiting hours) | The times a clinic accepts rep visits | Clinic hours |
| Rep plan (rep subscription) | What a rep pays to book visits with clinics | Clinic plans |
| Team plan and team seat | A plan a team manager buys that covers team members' bookings, one seat per member | |
| Company team, manager, member | A group of reps from one company; the manager sees members' visits | |
| Product sheet | Product information a rep carries in the app | |
| Territory | The area a rep covers | |

## Support terms

The support terms below describe how customers get help.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Support request | A request a clinic administrator opens in Admin → Support | "Ticket", "case" |
| SR reference | A support request's reference, SR-XXXXXX | Voucher batch number |
| Support request categories | General, technical, billing, account, onboarding, other | Contact form topics |
| Support request statuses | Open, in progress, resolved, closed | |
| Support chat | An in-app conversation between one clinic staff member and the MyClinicSoft platform team | Support request |
| Support hours | The published hours the support team answers | Staff working hours |
| Security report | An email to the support mailbox with the subject "Security report" | Support request |

## Systems and service providers

The systems below are the services MyClinicSoft runs on. The Systems Overview describes how they fit together.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Vercel | Application hosting and scheduled jobs | |
| Vercel Blob | Private storage for the audit-log archive | Cloudinary |
| MongoDB Atlas | Database hosting | |
| Cloudinary | Storage of uploaded files and documents | |
| Resend | Transactional email | "SMTP", "Nodemailer" (old setups) |
| Twilio | SMS reminders and one-time sign-in codes (not yet live) | |
| Upstash Redis | Shared rate limits | |
| Cloudflare Turnstile | Bot check on public forms (keys pending) | |
| PayMongo | Subscription payments, and patient bill payments for clinics that use it | "Paymongo", PayPal (removed) |
| Xendit, Maya Business | Patient bill payments, for clinics that connect their own account | Maya (the e-wallet) |
| Sentry | Error monitoring (inactive until set up) | |
| Expo and EAS | The toolkit and build service for the two mobile apps | |
| Anthropic | Provider of the AI scribe drafts | |
| Jitsi | Video for teleconsults | |
| NLM RxNav | Drug information service [TO CONFIRM: exact use] | |
| GitHub, GitHub Actions | Code hosting and automated checks | |
| Google Play | Store where eMCR is published for Android | App Store (iOS, not yet published) |

## Laws, regulators and payers

The laws, regulators and payers below appear in contracts, invoices and claims.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Data Privacy Act of 2012 (RA 10173) | The Philippine privacy law. Short form after first use: Data Privacy Act | "PH DPA", "Philippine Data Protection Act" (aliases in PRODUCT.md) |
| National Privacy Commission (NPC) | The Philippine privacy regulator | |
| Personal information controller | Who decides how personal data is used: the clinic for its patient records | Processor |
| Personal information processor | Who handles data on a controller's instructions: DevCom Digital for clinic records | Controller |
| BIR | Bureau of Internal Revenue, the Philippine tax authority | |
| PhilHealth | The national health insurer; clinics file claims against its case rates | "Philhealth" |
| HMO | A private payer of patient bills; clinics prepare HMO claims alongside each visit's billing | PhilHealth |
| PWD and senior citizen discounts | Discounts a clinic applies to an eligible patient's bill | Discounts on MyClinicSoft plans |
| QR Ph, GCash, Maya, GrabPay | Payment methods accepted through PayMongo | |
| ICD-10 | The international code list for diagnoses | |

## Abbreviations

The abbreviations below are used across the source files.

| Term | Meaning | Not to be confused with |
|---|---|---|
| 2FA | Two-factor sign-in for staff | App Lock |
| API | Application programming interface | |
| DPO | Data Protection Officer | |
| OTP | One-time sign-in code sent by SMS | Activation code |
| PHI | Patient health data that the apps treat as sensitive (term used in mobile/README.md) | |
| PHT | Philippine time, Asia/Manila, UTC+8 | |
| ₱, PHP | Philippine peso | |
| SR | Support request | |

## Document control

| Owner (role) | Version | Effective date | Review date | Related documents |
|---|---|---|---|---|
| [TO CONFIRM: owner role] | 0.1 (draft) | [TO CONFIRM: effective date] | [TO CONFIRM: review date] | Company Overview; Products and Services Catalogue; Teams and Responsibilities; Brand Voice and Writing Style Guide; Systems Overview; Customer Support Playbook |

## Open questions

1. [TO CONFIRM: pharmaceutical only, or pharmaceutical and medical-device] lib/roles.ts: "Pharmaceutical representatives who visit the clinic's doctors"; rep/README.md: "pharmaceutical and medical-device representatives" (contradiction 18).
2. [TO CONFIRM: exact use of NLM RxNav] .env.example configures it; the privacy page does not list it (contradiction 33).
3. [TO CONFIRM: owner role, effective date and review date of this document]
4. Product name: DESIGN.md calls the product "Clinic Management System"; MOBILE_ROADMAP.md and AUDIT.md write "myclinicsoft" (contradiction 21).
5. Staff roles: PRODUCT.md lists "Inventory managers" and "Finance & billing staff"; lib/roles.ts has no inventory role and adds "Medical technologist" and "Accountant" (contradiction 20). This glossary follows lib/roles.ts.
6. Email: PRODUCT.md says "email (SMTP)" and AUDIT.md "Nodemailer"; README.md and lib/email.ts use Resend (contradiction 35).
7. Payments: AUDIT.md lists "PayPal SDK"; docs/PUBLIC_SITE_FOLLOWUPS.md says "PayPal was removed" (contradiction 36).
8. Support chat: lib/support-chat.ts describes an in-app "Support chat" between clinic staff and the platform team, while docs/PUBLIC_SITE_FOLLOWUPS.md lists "phone/chat" among the "Unbacked claims removed" from the website. It is unclear whether support chat is an official support channel (contradiction 53).
9. Contact form: components/ContactForm.tsx offers the topic "Pricing or a demo", while app/(public)/demo/page.tsx says "Demos aren't offered — the 14-day free trial replaces them" (contradiction 52).
