# Patient Journey - Start to Finish

## Overview
This document outlines the complete patient journey through MyClinicSoft, from initial registration to final visit completion, including all steps, status transitions, and data models involved.

---

## Journey Flow Diagram

```
┌─────────────────┐
│ 1. REGISTRATION │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. APPOINTMENT  │
│    BOOKING      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. CHECK-IN /   │
│    QUEUE        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. VISIT /      │
│    CONSULTATION │
└────────┬────────┘
         │
         ├──► 5. PRESCRIPTIONS
         ├──► 6. LAB TESTS
         ├──► 7. IMAGING
         ├──► 8. PROCEDURES
         │
         ▼
┌─────────────────┐
│ 9. BILLING /    │
│    INVOICE      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 10. PAYMENT     │
└────────┬────────┘
         │
         ├──► 11. FOLLOW-UP
         └──► 12. REFERRAL (if needed)
```

---

## Detailed Journey Steps

### 1. Patient Registration

**Entry Points:**
- **Self-Registration**: Patient registers via public portal (`/api/patients/public`)
- **Staff Registration**: Receptionist/Admin creates patient record (`/api/patients`)

**Process:**
1. Patient provides personal information:
   - Basic Info: firstName, lastName, middleName, dateOfBirth, sex
   - Contact: email, phone, address
   - Emergency Contact: name, phone, relationship
   - Medical History: allergies, pre-existing conditions, medications
   - Identifiers: PhilHealth, Government ID (optional)

2. System automatically generates:
   - `patientCode`: Format `CLINIC-XXXX` (e.g., CLINIC-0001)
   - Unique email validation
   - Timestamps: `createdAt`, `updatedAt`

3. Patient record created in `Patient` model

**Models Involved:**
- `Patient` - Main patient record

**Status:**
- `active: true` (default)

**API Endpoints:**
- `POST /api/patients/public` - Public self-registration
- `POST /api/patients` - Staff registration (requires auth)

**Next Step:** Appointment Booking

---

### 2. Appointment Booking

**Entry Points:**
- **Scheduled Appointment**: Patient books in advance
- **Walk-in Appointment**: Patient arrives without appointment

**Process:**

#### Scheduled Appointment:
1. Patient selects:
   - Doctor/Provider
   - Date and Time
   - Reason for visit
   - Room (optional)

2. System validates:
   - Doctor availability
   - Time slot availability
   - No conflicting appointments

3. System creates `Appointment` record:
   - `appointmentCode`: Auto-generated (e.g., `APT-000001`)
   - `status`: `'pending'` → `'scheduled'` → `'confirmed'`
   - `isWalkIn: false`
   - `appointmentDate`, `appointmentTime` or `scheduledAt`

4. Confirmation sent:
   - SMS/Email notification (if enabled)
   - Appointment details

#### Walk-in Appointment:
1. Receptionist creates appointment:
   - `isWalkIn: true`
   - `queueNumber`: Auto-assigned
   - `status`: `'scheduled'` or `'confirmed'`

**Models Involved:**
- `Appointment` - Appointment record
- `Patient` - Patient reference
- `Doctor` / `User` - Provider reference
- `Room` - Room assignment (optional)

**Status Transitions:**
```
pending → scheduled → confirmed → completed
                              ↓
                         cancelled
                         no-show
                         rescheduled
```

**API Endpoints:**
- `POST /api/appointments` - Create appointment (staff)
- `POST /api/appointments/public` - Public booking
- `POST /api/patients/appointments` - Patient portal booking
- `GET /api/appointments` - List appointments
- `PUT /api/appointments/[id]` - Update appointment

**Next Step:** Check-in / Queue

---

### 3. Check-in / Queue Management

**Process:**
1. Patient arrives at clinic
2. Check-in methods:
   - **Manual**: Receptionist checks in patient
   - **QR Code**: Patient scans QR code
   - **Kiosk**: Self-service kiosk check-in

3. System creates/updates `Queue` entry:
   - `queueNumber`: Auto-generated (e.g., `A20240101-001` for appointments, `W20240101-001` for walk-ins)
   - `queueType`: `'appointment'` | `'walk-in'` | `'follow-up'`
   - `status`: `'waiting'` → `'in-progress'` → `'completed'`
   - `checkedIn: true`
   - `checkedInAt`: Timestamp
   - `estimatedWaitTime`: Calculated based on queue

4. Queue display:
   - Shows patient position
   - Estimated wait time
   - Assigned doctor/room

**Models Involved:**
- `Queue` - Queue management
- `Appointment` - Linked appointment (if scheduled)
- `Patient` - Patient reference
- `Doctor` - Assigned doctor
- `Room` - Assigned room

**Status Transitions:**
```
waiting → in-progress → completed
                    ↓
              cancelled
              no-show
```

**API Endpoints:**
- `POST /api/queue` - Add to queue
- `GET /api/queue` - Get current queue
- `PUT /api/queue/[id]` - Update queue status
- `POST /api/queue/[id]/check-in` - Check-in patient

**Next Step:** Visit / Consultation

---

### 4. Visit / Consultation

**Process:**
1. Patient called to consultation room
2. Nurse/Staff records vitals:
   - Blood Pressure (BP)
   - Heart Rate (HR)
   - Respiratory Rate (RR)
   - Temperature
   - SpO2
   - Height, Weight, BMI

3. Doctor conducts consultation:
   - Chief Complaint
   - History of Present Illness
   - Physical Examination
   - Assessment/Diagnosis (ICD-10 codes)
   - Treatment Plan

4. System creates `Visit` record:
   - `visitCode`: Auto-generated
   - `visitType`: `'consultation'` | `'follow-up'` | `'checkup'` | `'emergency'` | `'teleconsult'`
   - `status`: `'open'` → `'closed'`
   - Vitals recorded
   - SOAP Notes documented
   - Diagnoses added

5. Digital signature (optional):
   - Provider signs visit record
   - Timestamp and IP address recorded

**Models Involved:**
- `Visit` - Main visit record
- `Patient` - Patient reference
- `User` - Provider reference
- `Appointment` - Linked appointment (if applicable)
- `Queue` - Queue entry updated

**Status Transitions:**
```
open → closed
     ↓
cancelled
```

**API Endpoints:**
- `POST /api/visits` - Create visit
- `GET /api/visits` - List visits
- `GET /api/visits/[id]` - Get visit details
- `PUT /api/visits/[id]` - Update visit
- `POST /api/visits/[id]/upload` - Upload documents

**Next Steps:** Prescriptions, Lab Tests, Imaging, Procedures

---

### 5. Prescriptions

**Process:**
1. Doctor prescribes medications during visit
2. System creates `Prescription` record:
   - `prescriptionCode`: Auto-generated
   - `medications[]`: Array of prescribed medicines
   - `status`: `'active'` → `'dispensed'` → `'completed'`
   - Drug interaction check performed
   - Digital signature (optional)

3. Prescription details:
   - Medicine name, dosage, frequency
   - Duration
   - Instructions
   - Quantity

4. Prescription linked to:
   - `Visit`
   - `Patient`
   - `prescribedBy` (User/Doctor)

5. Prescription can be:
   - Printed for patient
   - Sent digitally (email/SMS)
   - Dispensed at pharmacy

**Models Involved:**
- `Prescription` - Prescription record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `Medicine` - Medicine catalog reference
- `User` - Prescribing doctor

**Status Transitions:**
```
active → dispensed → completed
       ↓
   cancelled
   partially-dispensed
```

**API Endpoints:**
- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions` - List prescriptions
- `GET /api/prescriptions/[id]` - Get prescription
- `PUT /api/prescriptions/[id]` - Update prescription
- `POST /api/prescriptions/[id]/dispense` - Mark as dispensed
- `GET /api/prescriptions/[id]/print` - Print prescription
- `POST /api/prescriptions/check-interactions` - Check drug interactions

**Next Step:** Continue to Lab Tests, Imaging, or Billing

---

### 6. Lab Tests / Laboratory Results

**Process:**
1. Doctor orders lab tests during visit
2. System creates `LabResult` record:
   - `requestCode`: Auto-generated
   - `request`: Test type, urgency, special instructions
   - `status`: `'ordered'` → `'in-progress'` → `'completed'` → `'reviewed'`
   - Third-party lab integration (optional)

3. Lab test details:
   - Test type (e.g., CBC, Urinalysis)
   - Test code (LOINC)
   - Urgency: `'routine'` | `'urgent'` | `'stat'`
   - Fasting requirements
   - Preparation notes

4. Results entry:
   - Results data (structured)
   - Reference ranges
   - Abnormal flags
   - Interpretation
   - Attachments (PDF, images)

5. Results review:
   - `reviewedBy`: Doctor who reviewed
   - `reviewedAt`: Review timestamp
   - Patient notification sent (if enabled)

**Models Involved:**
- `LabResult` - Lab result record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Ordering doctor, reviewing doctor
- `Attachment` - Result documents

**Status Transitions:**
```
ordered → in-progress → completed → reviewed
                              ↓
                         cancelled
```

**API Endpoints:**
- `POST /api/lab-results` - Create lab order
- `GET /api/lab-results` - List lab results
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result
- `POST /api/lab-results/[id]/upload` - Upload results
- `POST /api/lab-results/[id]/notify` - Notify patient
- `GET /api/lab-results/[id]/request-form` - Get request form

**Next Step:** Continue to Imaging, Procedures, or Billing

---

### 7. Imaging

**Process:**
1. Doctor orders imaging during visit
2. System creates `Imaging` record:
   - `modality`: X-ray, CT, MRI, Ultrasound, etc.
   - `bodyPart`: Area to be imaged
   - `status`: `'ordered'` → `'completed'` → `'reported'`
   - Order date

3. Imaging details:
   - Modality type
   - Body part
   - Special instructions
   - Findings
   - Impression
   - Images attached

4. Results entry:
   - Findings documented
   - Impression/report
   - Images uploaded
   - Reported by radiologist

**Models Involved:**
- `Imaging` - Imaging record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Ordering doctor, reporting doctor
- `Attachment` - Image files

**Status Transitions:**
```
ordered → completed → reported
              ↓
         cancelled
```

**API Endpoints:**
- `POST /api/imaging` - Create imaging order
- `GET /api/imaging` - List imaging orders
- `GET /api/imaging/[id]` - Get imaging details
- `PUT /api/imaging/[id]` - Update imaging

**Next Step:** Continue to Procedures or Billing

---

### 8. Procedures

**Process:**
1. Doctor performs procedure during visit
2. System creates `Procedure` record:
   - `type`: Minor surgery, wound care, IV insertion, etc.
   - `date`: Procedure date
   - `details`: Procedure description
   - `outcome`: Procedure outcome
   - Attachments (photos, documents)

3. Procedure details:
   - Type of procedure
   - Performed by (User/Doctor)
   - Date and time
   - Details and notes
   - Outcome documentation

**Models Involved:**
- `Procedure` - Procedure record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Performing doctor/staff
- `Attachment` - Procedure documentation

**API Endpoints:**
- `POST /api/procedures` - Create procedure record
- `GET /api/procedures` - List procedures
- `GET /api/procedures/[id]` - Get procedure details
- `PUT /api/procedures/[id]` - Update procedure

**Next Step:** Billing / Invoice

---

### 9. Billing / Invoice

**Process:**
1. After visit completion, invoice is created
2. System creates `Invoice` record:
   - `invoiceNumber`: Auto-generated (e.g., `INV-20240101-001`)
   - `items[]`: Services, procedures, medications
   - `subtotal`: Sum of items
   - `discounts[]`: PWD, Senior, Membership discounts
   - `tax`: Tax amount (if applicable)
   - `total`: Final amount
   - `status`: `'unpaid'` → `'partial'` → `'paid'`

3. Invoice items:
   - Services (consultation, procedures)
   - Medications
   - Lab tests
   - Imaging
   - Each item has: code, description, quantity, unit price, total

4. Discounts applied:
   - PWD discount
   - Senior discount
   - Membership discount
   - Promotional discounts

5. Insurance/HMO (if applicable):
   - Provider information
   - Policy number
   - Coverage type
   - Claim status

**Models Involved:**
- `Invoice` - Invoice record
- `Patient` - Patient reference
- `Visit` - Linked visit
- `Service` - Service catalog
- `User` - Created by
- `Membership` - Membership discount (if applicable)

**Status Transitions:**
```
unpaid → partial → paid
              ↓
         refunded
```

**API Endpoints:**
- `POST /api/invoices` - Create invoice
- `GET /api/invoices` - List invoices
- `GET /api/invoices/[id]` - Get invoice
- `PUT /api/invoices/[id]` - Update invoice
- `GET /api/invoices/outstanding` - Get unpaid invoices
- `GET /api/invoices/[id]/receipt` - Get receipt

**Next Step:** Payment Processing

---

### 10. Payment Processing

**Process:**
1. Patient pays invoice
2. Payment recorded in `Invoice.payments[]`:
   - `method`: cash, gcash, bank_transfer, card, check, insurance, hmo
   - `amount`: Payment amount
   - `date`: Payment date
   - `receiptNo`: Receipt number
   - `referenceNo`: Reference number (for digital payments)
   - `processedBy`: User who processed payment

3. Payment calculations:
   - `totalPaid`: Sum of all payments
   - `outstandingBalance`: `total - totalPaid`
   - `status`: Updated based on payment

4. Multiple payments supported:
   - Partial payments allowed
   - Different payment methods
   - Payment history tracked

5. Receipt generation:
   - Digital receipt
   - Printable receipt
   - Email/SMS receipt (if enabled)

**Models Involved:**
- `Invoice` - Invoice with payments
- `User` - Payment processor
- `Patient` - Patient reference

**Payment Methods:**
- Cash
- GCash
- Bank Transfer
- Credit/Debit Card
- Check
- Insurance/HMO
- Other

**API Endpoints:**
- `POST /api/invoices/[id]/payment` - Record payment
- `GET /api/invoices/[id]/receipt` - Get receipt
- `GET /api/invoices/outstanding` - Get outstanding invoices

**Next Steps:** Follow-up or Referral

---

### 11. Follow-up Appointment

**Process:**
1. Doctor schedules follow-up during visit
2. Follow-up details:
   - `followUpDate`: Scheduled date
   - `followUpReminderSent`: Reminder status
   - Instructions for patient

3. New appointment created:
   - Linked to previous visit
   - `visitType`: `'follow-up'`
   - Reminder notifications scheduled

4. Follow-up reminders:
   - SMS/Email sent before appointment
   - Configurable reminder times

**Models Involved:**
- `Visit` - Original visit with follow-up date
- `Appointment` - Follow-up appointment
- `Patient` - Patient reference

**API Endpoints:**
- `POST /api/appointments` - Create follow-up appointment
- `GET /api/appointments` - List appointments including follow-ups

**Journey Continues:** Back to Step 2 (Appointment Booking)

---

### 12. Referral (If Needed)

**Process:**
1. Doctor refers patient to specialist or external clinic
2. System creates `Referral` record:
   - `referralCode`: Auto-generated
   - `type`: `'doctor_to_doctor'` | `'patient_to_patient'` | `'external'`
   - `referringDoctor`: Current doctor
   - `receivingDoctor`: Specialist (if internal)
   - `receivingClinic`: External clinic (if external)
   - `patient`: Patient being referred
   - `reason`: Reason for referral
   - `urgency`: `'routine'` | `'urgent'` | `'stat'`
   - Clinical information included

3. Referral details:
   - Chief complaint
   - Diagnosis
   - Relevant history
   - Current medications
   - Attachments (documents, images)

4. Referral status:
   - `status`: `'pending'` → `'accepted'` → `'completed'`
   - Tracking of acceptance and completion
   - Feedback collection

5. Visit/Appointment created from referral:
   - New visit or appointment linked to referral
   - Status updated when completed

**Models Involved:**
- `Referral` - Referral record
- `Patient` - Patient reference
- `Doctor` - Referring and receiving doctors
- `Visit` - Visit created from referral
- `Appointment` - Appointment created from referral
- `Document` - Referral documents

**Status Transitions:**
```
pending → accepted → completed
              ↓
         declined
         cancelled
```

**API Endpoints:**
- `POST /api/referrals` - Create referral
- `GET /api/referrals` - List referrals
- `GET /api/referrals/[id]` - Get referral
- `PUT /api/referrals/[id]` - Update referral
- `POST /api/referrals/[id]/accept` - Accept referral
- `POST /api/referrals/[id]/complete` - Complete referral

**Journey Continues:** Patient follows up with referred doctor/clinic

---

## Supporting Features

### Documents Management
- Documents can be attached at any stage
- Categories: referral, laboratory_result, imaging, medical_certificate, prescription, invoice, id, insurance, other
- OCR support for scanned documents
- Cloudinary integration for storage

### Notifications
- Appointment reminders (SMS/Email)
- Lab result notifications
- Invoice reminders
- Follow-up reminders
- System notifications

### Membership & Loyalty
- Points system
- Tier-based discounts
- Referral tracking
- Transaction history

### Audit Trail
- All actions logged in `AuditLog`
- Compliance tracking (PH DPA)
- User activity monitoring
- Data access logs

---

## Status Summary

### Appointment Statuses
- `pending` → `scheduled` → `confirmed` → `completed`
- `cancelled`, `no-show`, `rescheduled`

### Visit Statuses
- `open` → `closed`
- `cancelled`

### Prescription Statuses
- `active` → `dispensed` → `completed`
- `cancelled`, `partially-dispensed`

### Lab Result Statuses
- `ordered` → `in-progress` → `completed` → `reviewed`
- `cancelled`

### Imaging Statuses
- `ordered` → `completed` → `reported`
- `cancelled`

### Invoice Statuses
- `unpaid` → `partial` → `paid`
- `refunded`

### Queue Statuses
- `waiting` → `in-progress` → `completed`
- `cancelled`, `no-show`

### Referral Statuses
- `pending` → `accepted` → `completed`
- `declined`, `cancelled`

---

## Data Model Relationships

```
Patient
├── Appointments (1:N)
├── Visits (1:N)
│   ├── Prescriptions (1:N)
│   ├── LabResults (1:N)
│   ├── Imaging (1:N)
│   ├── Procedures (1:N)
│   └── Documents (1:N)
├── Invoices (1:N)
├── Queue Entries (1:N)
├── Referrals (1:N)
├── Membership (1:1)
└── Documents (1:N)

Appointment
├── Patient (N:1)
├── Doctor/User (N:1)
├── Room (N:1)
└── Queue (1:1)

Visit
├── Patient (N:1)
├── Provider/User (N:1)
├── Appointment (N:1, optional)
├── Prescriptions (1:N)
├── LabResults (1:N)
├── Imaging (1:N)
├── Procedures (1:N)
└── Documents (1:N)

Invoice
├── Patient (N:1)
├── Visit (N:1, optional)
├── Services (N:M via items)
└── User (N:1, createdBy)
```

---

## API Endpoint Summary

### Patient Management
- `GET /api/patients` - List patients
- `POST /api/patients` - Create patient (staff)
- `POST /api/patients/public` - Public registration
- `GET /api/patients/[id]` - Get patient
- `PUT /api/patients/[id]` - Update patient

### Appointments
- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `POST /api/appointments/public` - Public booking
- `GET /api/appointments/[id]` - Get appointment
- `PUT /api/appointments/[id]` - Update appointment

### Visits
- `GET /api/visits` - List visits
- `POST /api/visits` - Create visit
- `GET /api/visits/[id]` - Get visit
- `PUT /api/visits/[id]` - Update visit

### Prescriptions
- `GET /api/prescriptions` - List prescriptions
- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions/[id]` - Get prescription
- `PUT /api/prescriptions/[id]` - Update prescription

### Lab Results
- `GET /api/lab-results` - List lab results
- `POST /api/lab-results` - Create lab order
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result

### Invoices
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/[id]` - Get invoice
- `PUT /api/invoices/[id]` - Update invoice
- `POST /api/invoices/[id]/payment` - Record payment

### Queue
- `GET /api/queue` - Get queue
- `POST /api/queue` - Add to queue
- `PUT /api/queue/[id]` - Update queue

### Referrals
- `GET /api/referrals` - List referrals
- `POST /api/referrals` - Create referral
- `GET /api/referrals/[id]` - Get referral
- `PUT /api/referrals/[id]` - Update referral

---

## Best Practices

1. **Always link related records**: Visits should reference appointments when applicable
2. **Maintain audit trail**: All actions are logged for compliance
3. **Validate at each step**: Ensure data integrity throughout the journey
4. **Notify patients**: Keep patients informed at key stages
5. **Handle errors gracefully**: Provide clear error messages and recovery paths
6. **Support multiple workflows**: Accommodate both scheduled and walk-in patients
7. **Track status changes**: Monitor status transitions for reporting
8. **Secure sensitive data**: Protect patient information (PH DPA compliance)

---

## Future Enhancements

- Teleconsultation integration
- Mobile app for patients
- Automated appointment reminders
- Online payment gateway integration
- Electronic health record (EHR) export
- Integration with external labs/imaging centers
- AI-powered diagnosis suggestions
- Automated insurance claim processing

---

*Last Updated: 2024*
*Version: 1.0*

