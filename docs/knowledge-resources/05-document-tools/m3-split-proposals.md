# M3 split proposals

Date: 2026-11-10. Not uploaded to the knowledge library.

These are proposals only, made with the M3 prompt ("Split a long document") and house rule 6 (one subject per document). No draft has been split or edited. Each proposal waits for the owner's approval; once approved, the new documents are written one at a time and the original draft is retired.

Every draft in 01-company-foundations, 02-project-documents, 03-department-documents and 04-training-material was reviewed (index files excluded). A split is proposed only where a draft mixes subjects beyond what its prompt asks for, is far longer than the rest of the library, or holds content at two different confidentiality levels. Drafts that cover several items by design (for example Systems Overview, Products and Services Catalogue, Company Glossary, Customer FAQ) are not split for that reason alone.

Word counts below include the Document control and Open questions sections. Most drafts are 1,700-3,000 words.

## myclinicsoft: Requirements and Acceptance Criteria

Reason: at about 4,010 words this is the longest draft in the library (the next longest, Systems Overview, is about 3,400), and it covers three separate subjects: requirements for the MyClinicSoft web platform, requirements for the two mobile apps (eMCR and MyClinicSoft Rep), and go-live and operations requirements (SMS, production configuration, backups and release order). Each subject has its own builders and acceptance owners, and the Open questions section alone is about 580 words. Splitting by subject keeps each document a manageable size and lets search return the right product's requirements. The requirement numbers (R1-R44) should be kept unchanged in the new documents so that cross-references in the Decision Log, Risks and procedures still work. All three documents stay Project and Internal, like the original.

| Proposed document | Category | Confidentiality | Sections from the original |
|---|---|---|---|
| myclinicsoft: Web Platform Requirements | Project | Internal | Summary (rewritten for this scope); Access control and audit requirements (R1-R3); Data privacy requirements (R4-R6); Product principle requirements (R7-R10); Brand and public claim requirements (R11-R13); Plan limit requirements (R14-R15); the Open questions about these requirements |
| myclinicsoft: eMCR and MyClinicSoft Rep App Requirements | Project | Internal | Summary (rewritten for this scope); eMCR sign-in and session requirements (R16-R18); eMCR MVP requirements (records) (R19-R22); eMCR MVP requirements (payments, alerts and profile) (R23-R26); eMCR privacy and selling requirements (R27-R29); MyClinicSoft Rep requirements (R30-R32); R41 (conditions for re-enabling rep self sign-up), moved from "Public site and configuration requirements"; the Open questions about these requirements |
| myclinicsoft: Go-Live and Operations Requirements | Project | Internal | Summary (rewritten for this scope); SMS rule requirements (R33-R35); SMS go-live requirements (R36-R38); Public site and configuration requirements (R39-R40; R41 moves to the app document); Backup and release requirements (R42-R44); Definition of done (project-wide, with a pointer from the other two documents); the Open questions about these requirements |

## Standard Contract Terms Summary

Reason: the whole draft is labelled Confidential, but most of it summarises and quotes the published Terms of Service (www.myclinicsoft.solutions/terms), which clinics and patients can already read. Locking the public terms behind Confidential keeps them away from support and sales staff who are asked about them every day. The parts that really are sensitive are DevCom Digital's negotiating position: the Enterprise contract terms, which terms may be negotiated and by whom, and which terms are never changed. Splitting by sensitivity lets the public terms be Internal and keeps the negotiating position Confidential.

| Proposed document | Category | Confidentiality | Sections from the original |
|---|---|---|---|
| Terms of Service Summary for Clinics and eMCR Patients | Legal | Internal | Summary (rewritten for this scope); Contract type: Terms of Service for clinics; Terms of Service: payment and refunds; Terms of Service: data protection; Terms of Service: liability, indemnity and disputes; Contract type: eMCR terms for patients; How a contract is sent, signed and stored (steps 1-4 and 6); the Open questions about the published terms |
| Enterprise Contract and Negotiation Rules | Legal | Confidential | Summary (rewritten for this scope); Contract type: Enterprise contract; Terms that may be negotiated and by whom; Terms that may never be changed; How a contract is sent, signed and stored (step 5, Enterprise contracts); the Open questions about Enterprise contracts and negotiation |

## Drafts with no split proposed

- Communication and Conduct Standards: one policy subject.
- Company Glossary: long (about 2,850 words) but a glossary by design; grouped sections already search well.
- Company Overview: one subject; short.
- Data Handling and Confidentiality: covers data categories, confidentiality levels and data rules, as its prompt (C6) asks; no sensitive values.
- Products and Services Catalogue: holds only public list prices and plan limits; costs, margins and the wholesale voucher price are already kept in Pricing and Discount Rules.
- Teams and Responsibilities: one subject; only role mailboxes, no personal contact details.
- myclinicsoft: Decision Log: one log.
- myclinicsoft: Project Brief: one project brief; the budget section holds no figures, only [TO CONFIRM] markers.
- myclinicsoft: Risks, Assumptions and Constraints: one risk register, as its prompt (P5) asks.
- myclinicsoft: Stakeholders and Communication Plan: one subject; roles and role mailboxes only, no personal details.
- Brand Voice and Writing Style Guide: one subject.
- Customer FAQ: one question per section by design; holds only information safe to give customers.
- Customer Support Playbook: the common-issue sections are what its prompt (D1) asks for, and it points to the separate procedures (erasure, deletion, opt-out, breach, vouchers) instead of repeating them.
- Deleting a Closed Clinic's Data: one procedure.
- Engineering Standards and Release Procedure: combines standards and release steps as its prompt (D7) asks; it could be split later into "Engineering Standards" (Technical) and "Releasing and Rolling Back Changes" (SOP) once the [TO CONFIRM] review, rollback and approval rules are filled in.
- Going Live with SMS and Phone Codes: one procedure.
- Handling a Clinic Support Request: one procedure.
- Handling a Patient Data Erasure Request: one procedure.
- Handling an SMS Opt-Out: one procedure.
- Invoicing and Expenses Procedure: combines invoicing and expenses as its prompt (D8) asks, and the expense, purchase and month-end sections are still only [TO CONFIRM] placeholders. Once those rules exist, a split into "Invoicing Clinics for MyClinicSoft Subscriptions" (SOP) and "Expenses, Purchases and Month-End Close" (Financial) is worth reconsidering. No bank or tax ID details are present.
- Issuing eMCR Activation Voucher Batches: one procedure; it refers to Pricing and Discount Rules for prices and does not state the wholesale price.
- Onboarding a New Clinic: one procedure; the record-import help and trial warnings are part of onboarding.
- Pricing and Discount Rules: already Confidential and holds the sensitive pricing (wholesale voucher price, clinic commission, discount authority) in one place, as intended.
- Responding to a Suspected Data Breach: one procedure.
- Restoring the Database After an Incident: one procedure.
- Running a Production Data Migration: one procedure.
- Running the Backup Restore Drill: one procedure; short.
- Sales Playbook: one subject; it refers to Pricing and Discount Rules for exceptions and holds no prices.
- Systems Overview: long (about 3,400 words) but covering many systems is its prompt's (D6) design; one section per system.
- Customer Support Agent: Lesson Pack: one training subject.
