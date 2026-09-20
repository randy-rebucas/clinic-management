# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Multi-role SaaS for clinics and medical practices, with no single role dominating design priority:
- Clinical staff (doctors, nurses) — visit documentation, diagnoses, prescriptions, lab results
- Practice administrators / clinic owners — dashboards, staff, services, rooms, reports
- Receptionist/front-desk — appointment booking, patient check-in, queue management
- Finance & billing staff — invoicing, payments, financial reports
- Inventory managers — medicine/supply tracking, restocking
- Patients — self-service portal (records, booking)
- Medical representatives — dedicated pharma sales portal (visit tracking, product management)

## Product Purpose

An integrated clinic management platform covering the full operational loop of a healthcare practice — patient registration through billing — so staff spend less time on administrative overhead and more on patient care. Success means clinics run day-to-day operations (scheduling, clinical documentation, billing, inventory) from one system instead of several disconnected tools.

## Positioning

Full-stack integration purpose-built for Philippine healthcare compliance (PH DPA) — not a generic scheduling or EHR tool retrofitted with compliance, but compliance and audit logging embedded from the ground up, alongside specialized modules (medical rep portal, queue management) that general-purpose practice-management software doesn't cover.

## Operating Context

- Multi-clinic / multi-tenant support (clinic onboarding, tenant scripts in `scripts/`)
- Calendar-based appointment scheduling with public booking portal
- QR-code based patient queue management and display screens
- Clinical workflows: visit notes, ICD-10 diagnosis coding, e-prescriptions with drug interaction checks
- Billing/invoicing with multiple payment methods, receipts
- Inventory with low-stock alerts, batch/expiry tracking
- Document storage via Cloudinary
- Notifications via SMS (Twilio), email (SMTP), and in-app
- Knowledge base module for internal staff training

## Capabilities and Constraints

- Stack: Next.js 16 (App Router), TypeScript, MongoDB/Mongoose, Tailwind CSS, JWT auth
- RBAC across all modules; audit logging of data access/modification is a compliance requirement, not optional
- PH DPA (Philippine Data Protection Act) compliance is a hard constraint on data handling; HIPAA-aligned practices referenced as well
- Primary geography: Philippines, secondary ASEAN
- Deployment-agnostic (cloud or on-prem); no specific accessibility standard mandated beyond general good practice

## Brand Commitments

Existing brand identity (name, `BrandLogo` component, colors already integrated into LoginPage, PublicLayout, and Sidebar) is fixed and binding — preserve as-is rather than treating as a placeholder.

## Evidence on Hand

- `COMPANY_PROFILE.md` — authoritative source for product features, modules, target market, and roadmap; treat as current product truth unless the user says otherwise.
- No customer testimonials, case studies, or pricing figures on hand — future work must not fabricate these.

## Product Principles

1. Operational speed and low error rate matter across every role equally — no role's workflow should be deprioritized for another's.
2. Compliance (PH DPA, audit trails, RBAC) is embedded in the product, not bolted on — UI should make audit/compliance-relevant actions traceable and clear, never hidden.
3. One integrated system replaces several disconnected tools — cross-module consistency (patients, billing, inventory, scheduling) is a core value, not a nice-to-have.
4. Multi-tenant/multi-clinic scale must not be an afterthought — flows should hold up for both a single practice and a healthcare network.

## Accessibility & Inclusion

No formal compliance standard or specific user-need requirement established; follow general good accessibility practice.
