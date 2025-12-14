# Receptionist Journey - Start to Finish

## Overview
This document outlines the complete receptionist journey through the Clinic Management System, covering patient registration, appointment scheduling, queue management, and billing support.

---

## Journey Flow Diagram

```
┌─────────────────┐
│ 1. ONBOARDING   │
│   & SETUP       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. PATIENT      │
│   REGISTRATION  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. APPOINTMENT  │
│   SCHEDULING    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. QUEUE        │
│   MANAGEMENT    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. PATIENT      │
│   CHECK-IN      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. INVOICE      │
│   MANAGEMENT    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 7. PAYMENT      │
│   PROCESSING    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 8. REPORTS      │
│   & TRACKING    │
└─────────────────┘
```

---

## Detailed Journey Steps

### 1. Receptionist Onboarding & Setup

**Entry Point:**
- Admin creates receptionist profile via staff management

**Process:**
1. Admin creates `Receptionist` record with:
   - Personal Information: firstName, lastName, email, phone
   - Employee ID
   - Department assignment
   - Hire date

2. System automatically:
   - Creates `User` account linked to receptionist profile
   - Assigns 'receptionist' role
   - Generates default password
   - Sets status: `'active'`

3. Receptionist receives:
   - Login credentials
   - Account activation instructions
   - First-time login prompts password change

4. Initial setup:
   - Receptionist logs in and changes password
   - Completes profile information
   - Reviews permissions and access
   - Familiarizes with system

**Models Involved:**
- `Receptionist` - Receptionist profile
- `User` - User account (auto-created)
- `Role` - Receptionist role assignment

**Status:**
- `status: 'active'` | `'inactive'` | `'on-leave'`

**API Endpoints:**
- `POST /api/staff` (type: 'receptionist') - Create receptionist (admin only)
- `GET /api/staff?type=receptionist` - List receptionists
- `GET /api/staff/[id]` - Get receptionist details
- `PUT /api/staff/[id]` - Update receptionist profile

**Next Step:** Patient Registration

---

### 2. Patient Registration

**Process:**
1. New patient registration:
   - Collect patient information
   - Verify identity documents
   - Enter demographic data
   - Record contact information

2. Patient information collected:
   - Basic Info: firstName, lastName, middleName, dateOfBirth, sex
   - Contact: email, phone, address
   - Emergency Contact: name, phone, relationship
   - Medical History: allergies, pre-existing conditions
   - Identifiers: PhilHealth, Government ID (optional)

3. System creates patient:
   - Auto-generates `patientCode` (e.g., CLINIC-0001)
   - Validates email uniqueness
   - Creates patient record
   - Sets status: `active: true`

4. Registration confirmation:
   - Provide patient code
   - Confirm registration
   - Offer appointment scheduling

**Models Involved:**
- `Patient` - Patient record

**API Endpoints:**
- `POST /api/patients` - Create patient
- `GET /api/patients` - List patients
- `GET /api/patients/[id]` - Get patient details
- `PUT /api/patients/[id]` - Update patient

**Next Step:** Appointment Scheduling

---

### 3. Appointment Scheduling

**Process:**
1. Schedule appointment:
   - Select patient (existing or new)
   - Choose doctor
   - Select date and time
   - Check doctor availability
   - Set appointment duration
   - Assign room (optional)
   - Add reason for visit

2. Appointment creation:
   - System auto-generates `appointmentCode` (e.g., APT-000001)
   - Sets initial status: `'pending'` or `'scheduled'`
   - Links to patient and doctor
   - Records created by receptionist

3. Walk-in appointments:
   - Create walk-in appointment
   - Assign queue number
   - Set `isWalkIn: true`
   - Add to queue immediately

4. Appointment confirmation:
   - Confirm appointment details
   - Send confirmation (SMS/Email if enabled)
   - Provide appointment code
   - Remind patient of appointment

5. Appointment management:
   - Reschedule appointments
   - Cancel appointments
   - Update appointment details
   - View appointment history

**Models Involved:**
- `Appointment` - Appointment record
- `Patient` - Patient reference
- `Doctor` - Doctor reference
- `Room` - Room assignment (optional)

**Status:**
- `status: 'pending'` → `'scheduled'` → `'confirmed'` → `'completed'`

**API Endpoints:**
- `POST /api/appointments` - Create appointment
- `GET /api/appointments` - List appointments
- `GET /api/appointments/[id]` - Get appointment
- `PUT /api/appointments/[id]` - Update appointment
- `DELETE /api/appointments/[id]` - Delete appointment
- `GET /api/appointments/public` - Check availability

**Next Step:** Queue Management

---

### 4. Queue Management

**Process:**
1. View queue:
   - Current queue status
   - Waiting patients
   - In-progress patients
   - Queue positions

2. Queue operations:
   - Add patient to queue
   - Update queue status
   - Assign to doctor/room
   - Set priority
   - Estimate wait time

3. Queue types:
   - Appointment-based queue
   - Walk-in queue
   - Follow-up queue

4. Queue display:
   - Public queue display (if enabled)
   - Internal queue view
   - Real-time updates
   - Queue statistics

**Models Involved:**
- `Queue` - Queue management
- `Appointment` - Linked appointment
- `Patient` - Patient reference
- `Doctor` - Assigned doctor
- `Room` - Assigned room

**Status:**
- `status: 'waiting'` → `'in-progress'` → `'completed'`

**API Endpoints:**
- `GET /api/queue` - Get queue
- `POST /api/queue` - Add to queue
- `PUT /api/queue/[id]` - Update queue
- `GET /api/queue/display` - Public queue display

**Next Step:** Patient Check-in

---

### 5. Patient Check-in

**Process:**
1. Patient arrives:
   - Verify patient identity
   - Confirm appointment
   - Check patient information

2. Check-in methods:
   - **Manual**: Receptionist checks in patient
   - **QR Code**: Patient scans QR code
   - **Kiosk**: Self-service kiosk

3. Check-in process:
   - Mark patient as checked in
   - Update queue status
   - Notify doctor/nurse
   - Record check-in time
   - Update appointment status

4. Pre-visit tasks:
   - Verify insurance (if applicable)
   - Collect copay (if required)
   - Update patient information
   - Prepare documents

**Models Involved:**
- `Queue` - Queue entry
- `Appointment` - Appointment record
- `Patient` - Patient information

**API Endpoints:**
- `POST /api/queue/[id]/check-in` - Check-in patient
- `PUT /api/queue/[id]` - Update queue
- `GET /api/appointments/[id]` - Get appointment

**Next Step:** Invoice Management

---

### 6. Invoice Management

**Process:**
1. Create invoice:
   - After visit completion
   - Link to patient and visit
   - Add services and items
   - Calculate totals

2. Invoice items:
   - Consultation fees
   - Procedures
   - Medications
   - Lab tests
   - Imaging

3. Apply discounts:
   - PWD discount
   - Senior discount
   - Membership discount
   - Promotional discounts

4. Invoice details:
   - Auto-generate `invoiceNumber`
   - Calculate subtotal
   - Apply discounts
   - Calculate tax (if applicable)
   - Calculate total
   - Set status: `'unpaid'`

5. Invoice management:
   - View invoices
   - Update invoices
   - Print invoices
   - Email invoices

**Models Involved:**
- `Invoice` - Invoice record
- `Patient` - Patient reference
- `Visit` - Linked visit (optional)
- `Service` - Service catalog
- `Membership` - Membership discounts

**Status:**
- `status: 'unpaid'` → `'partial'` → `'paid'`

**API Endpoints:**
- `POST /api/invoices` - Create invoice
- `GET /api/invoices` - List invoices
- `GET /api/invoices/[id]` - Get invoice
- `PUT /api/invoices/[id]` - Update invoice
- `GET /api/invoices/outstanding` - Outstanding invoices

**Next Step:** Payment Processing

---

### 7. Payment Processing

**Process:**
1. Receive payment:
   - Patient pays invoice
   - Select payment method
   - Enter payment amount

2. Payment methods:
   - Cash
   - GCash
   - Bank Transfer
   - Credit/Debit Card
   - Check
   - Insurance/HMO
   - Other

3. Record payment:
   - Enter payment details
   - Record receipt number
   - Record reference number (for digital payments)
   - Update invoice status
   - Calculate outstanding balance

4. Multiple payments:
   - Support partial payments
   - Track payment history
   - Update invoice status
   - Calculate totals

5. Receipt generation:
   - Generate digital receipt
   - Print receipt
   - Email receipt (if enabled)
   - Record payment processor

**Models Involved:**
- `Invoice` - Invoice with payments
- `Patient` - Patient reference
- `User` - Payment processor (receptionist)

**API Endpoints:**
- `POST /api/invoices/[id]/payment` - Record payment
- `GET /api/invoices/[id]/receipt` - Get receipt
- `GET /api/invoices/outstanding` - Outstanding invoices

**Next Step:** Reports & Tracking

---

### 8. Reports & Tracking

**Process:**
1. View dashboard:
   - Today's appointments
   - Patient registrations
   - Revenue summary
   - Outstanding invoices
   - Queue status

2. Appointment reports:
   - Daily appointments
   - Appointment statistics
   - Doctor utilization
   - Cancellation rates

3. Patient reports:
   - New registrations
   - Patient statistics
   - Demographics
   - Activity summary

4. Financial reports:
   - Daily revenue
   - Payment methods breakdown
   - Outstanding balances
   - Period comparisons

5. Performance tracking:
   - Appointments scheduled
   - Patients registered
   - Invoices created
   - Payments processed

**Models Involved:**
- `Appointment` - Appointment data
- `Patient` - Patient data
- `Invoice` - Financial data
- `Queue` - Queue data

**API Endpoints:**
- `GET /api/reports/dashboard/role-based` - Receptionist dashboard
- `GET /api/appointments` - Appointment reports
- `GET /api/patients` - Patient reports
- `GET /api/invoices` - Invoice reports

---

## Key Features for Receptionists

### Dashboard
- Today's appointments overview
- Patient queue
- Revenue summary
- Outstanding invoices
- Quick actions

### Patient Management
- Patient registration
- Patient search
- Patient information updates
- Patient history access

### Appointment Management
- Schedule appointments
- Reschedule appointments
- Cancel appointments
- View doctor availability
- Appointment reminders

### Queue Management
- Add to queue
- Update queue status
- Assign to doctors/rooms
- Queue display
- Wait time estimation

### Billing Support
- Create invoices
- Process payments
- Generate receipts
- Track outstanding balances
- Apply discounts

---

## Daily Workflow Summary

### Morning Routine
1. **Login** - Access receptionist dashboard
2. **Review Dashboard** - Check today's schedule
3. **Check Queue** - See waiting patients
4. **Prepare Workstation** - Set up for the day

### During Day
1. **Patient Registration** - Register new patients
2. **Appointment Scheduling** - Schedule appointments
3. **Queue Management** - Manage patient queue
4. **Patient Check-in** - Check in arriving patients
5. **Invoice Creation** - Create invoices after visits
6. **Payment Processing** - Process payments
7. **Customer Service** - Assist patients and visitors

### End of Day
1. **Complete Payments** - Process remaining payments
2. **Review Reports** - Check daily statistics
3. **Update Records** - Complete any pending tasks
4. **Prepare Next Day** - Review tomorrow's schedule

---

## Status Summary

### Receptionist Status
- `active` - Available for duty
- `inactive` - Not available
- `on-leave` - On leave/vacation

### Appointment Status
- `pending` - Awaiting confirmation
- `scheduled` - Confirmed appointment
- `confirmed` - Patient confirmed
- `completed` - Appointment completed
- `cancelled` - Appointment cancelled
- `no-show` - Patient didn't show

### Invoice Status
- `unpaid` - No payment received
- `partial` - Partial payment received
- `paid` - Fully paid
- `refunded` - Payment refunded

### Queue Status
- `waiting` - Waiting for service
- `in-progress` - Currently being served
- `completed` - Service completed
- `cancelled` - Cancelled
- `no-show` - Patient didn't show

---

## API Endpoint Summary

### Patient Management
- `GET /api/patients` - List patients
- `POST /api/patients` - Create patient
- `GET /api/patients/[id]` - Get patient
- `PUT /api/patients/[id]` - Update patient

### Appointment Management
- `GET /api/appointments` - List appointments
- `POST /api/appointments` - Create appointment
- `GET /api/appointments/[id]` - Get appointment
- `PUT /api/appointments/[id]` - Update appointment
- `DELETE /api/appointments/[id]` - Delete appointment

### Queue Management
- `GET /api/queue` - Get queue
- `POST /api/queue` - Add to queue
- `PUT /api/queue/[id]` - Update queue
- `POST /api/queue/[id]/check-in` - Check-in patient

### Invoice Management
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/[id]` - Get invoice
- `PUT /api/invoices/[id]` - Update invoice
- `POST /api/invoices/[id]/payment` - Record payment
- `GET /api/invoices/[id]/receipt` - Get receipt

### Reports
- `GET /api/reports/dashboard/role-based` - Receptionist dashboard

---

## Best Practices

1. **Patient Service**: Provide excellent customer service
2. **Accuracy**: Ensure accurate data entry
3. **Confidentiality**: Maintain patient privacy (PH DPA compliance)
4. **Efficiency**: Streamline processes for faster service
5. **Communication**: Communicate clearly with patients and staff
6. **Organization**: Keep queue and appointments organized
7. **Documentation**: Document all transactions accurately
8. **Professionalism**: Maintain professional demeanor

---

*Last Updated: 2024*
*Version: 1.0*

