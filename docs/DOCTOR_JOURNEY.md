# Doctor Journey - Start to Finish

## Overview
This document outlines the complete doctor journey through the Clinic Management System, from onboarding to daily practice management, including all workflows, responsibilities, and system interactions.

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
│ 2. SCHEDULE     │
│   MANAGEMENT    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. VIEW         │
│   APPOINTMENTS  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. CONDUCT      │
│   VISIT         │
└────────┬────────┘
         │
         ├──► 5. PRESCRIBE MEDICATIONS
         ├──► 6. ORDER LAB TESTS
         ├──► 7. ORDER IMAGING
         ├──► 8. PERFORM PROCEDURES
         ├──► 9. CREATE REFERRALS
         │
         ▼
┌─────────────────┐
│ 10. DOCUMENT    │
│     & SIGN      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 11. VIEW        │
│     PATIENT     │
│     HISTORY     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 12. TRACK       │
│     PERFORMANCE │
└─────────────────┘
```

---

## Detailed Journey Steps

### 1. Doctor Onboarding & Setup

**Entry Point:**
- Admin creates doctor profile via staff management

**Process:**
1. Admin creates `Doctor` record with:
   - Personal Information: firstName, lastName, email, phone
   - Professional Info: specialization, licenseNumber, qualifications
   - Department: department assignment
   - Title: Dr., Prof., etc.
   - Bio: Professional biography

2. System automatically:
   - Creates `User` account linked to doctor profile
   - Assigns 'doctor' role
   - Generates default password
   - Sets status: `'active'`

3. Doctor receives:
   - Login credentials (email + default password)
   - Account activation instructions
   - First-time login prompts password change

4. Initial setup:
   - Doctor logs in and changes password
   - Completes profile information
   - Sets up schedule (or admin sets it up)

**Models Involved:**
- `Doctor` - Doctor profile
- `User` - User account (auto-created)
- `Role` - Doctor role assignment

**Status:**
- `status: 'active'` | `'inactive'` | `'on-leave'`

**API Endpoints:**
- `POST /api/staff` (type: 'doctor') - Create doctor (admin only)
- `GET /api/doctors` - List doctors
- `GET /api/doctors/[id]` - Get doctor details
- `PUT /api/doctors/[id]` - Update doctor profile

**Next Step:** Schedule Management

---

### 2. Schedule Management

**Process:**
1. Doctor (or admin) sets up weekly schedule:
   - Define working hours for each day
   - Set start and end times (HH:mm format)
   - Mark days as available/unavailable
   - Set different schedules for different days

2. Schedule structure:
   ```typescript
   schedule: [{
     dayOfWeek: 0-6,        // 0=Sunday, 1=Monday, etc.
     startTime: "09:00",    // HH:mm format
     endTime: "17:00",      // HH:mm format
     isAvailable: true      // Can disable specific days
   }]
   ```

3. Availability overrides:
   - Override schedule for specific dates
   - Mark dates as unavailable (holidays, leave)
   - Adjust hours for specific dates
   - Add reason for override

4. Schedule viewing:
   - View weekly schedule
   - View monthly calendar
   - See appointment slots
   - Check availability

**Models Involved:**
- `Doctor` - Schedule stored in doctor profile
- `Appointment` - Appointments use schedule for validation

**API Endpoints:**
- `GET /api/doctors/[id]/schedule` - Get doctor schedule
- `PUT /api/doctors/[id]/schedule` - Update schedule (doctor or admin)
- `GET /api/appointments/public` - Public availability check

**Next Step:** View Appointments

---

### 3. View Appointments

**Process:**
1. Doctor views dashboard:
   - Today's appointments
   - Upcoming appointments
   - Appointment status overview
   - Quick stats

2. Appointment filtering:
   - Filter by date range
   - Filter by status (scheduled, confirmed, completed)
   - Filter by patient
   - Filter by room

3. Appointment details:
   - Patient information
   - Appointment time and date
   - Reason for visit
   - Previous visit history
   - Patient medical history summary

4. Appointment management:
   - View appointment details
   - See patient queue position
   - Check patient check-in status
   - View appointment notes

**Models Involved:**
- `Appointment` - Appointment records
- `Patient` - Patient information
- `Queue` - Queue status
- `Visit` - Previous visits

**API Endpoints:**
- `GET /api/appointments?doctorId=[id]` - Get doctor's appointments
- `GET /api/appointments?date=[date]` - Get appointments by date
- `GET /api/appointments/[id]` - Get appointment details
- `GET /api/reports/dashboard/role-based` - Doctor dashboard data

**Next Step:** Conduct Visit

---

### 4. Conduct Visit / Consultation

**Process:**
1. Patient called to consultation room
2. Doctor starts visit:
   - Create new `Visit` record
   - Link to appointment (if scheduled)
   - Set visit type: `'consultation'` | `'follow-up'` | `'checkup'` | `'emergency'` | `'teleconsult'`
   - Set status: `'open'`

3. Review patient information:
   - View patient demographics
   - Review medical history
   - Check allergies
   - Review previous visits
   - Check current medications

4. Record vitals (if not done by nurse):
   - Blood Pressure (BP)
   - Heart Rate (HR)
   - Respiratory Rate (RR)
   - Temperature
   - SpO2
   - Height, Weight, BMI

5. Conduct consultation:
   - Chief Complaint
   - History of Present Illness (HPI)
   - Physical Examination
   - Assessment/Diagnosis
   - Treatment Plan

6. Document SOAP Notes:
   - **Subjective**: Patient's description of symptoms
   - **Objective**: Measurable observations (vitals, exam)
   - **Assessment**: Clinical impression/diagnosis (ICD-10 codes)
   - **Plan**: Treatment plan

**Models Involved:**
- `Visit` - Main visit record
- `Patient` - Patient information
- `User` - Doctor/provider reference
- `Appointment` - Linked appointment

**Status:**
- `status: 'open'` → `'closed'`

**API Endpoints:**
- `POST /api/visits` - Create visit
- `GET /api/visits?providerId=[id]` - Get doctor's visits
- `GET /api/visits/[id]` - Get visit details
- `PUT /api/visits/[id]` - Update visit
- `POST /api/visits/[id]/upload` - Upload documents

**Next Steps:** Prescribe, Order Tests, Order Imaging, Perform Procedures

---

### 5. Prescribe Medications

**Process:**
1. During visit, doctor prescribes medications
2. Create prescription:
   - Select medicine from catalog or enter manually
   - Set dosage and frequency
   - Set duration
   - Add instructions
   - Check drug interactions (if enabled)

3. Prescription details:
   - Medicine name, generic name
   - Form (tablet, capsule, syrup, etc.)
   - Strength (e.g., 500mg)
   - Dose (e.g., "500mg")
   - Frequency (e.g., "BID", "TID")
   - Duration (e.g., "7 days")
   - Quantity
   - Instructions

4. Drug interaction check:
   - System checks against patient's current medications
   - Flags potential interactions
   - Shows severity (mild, moderate, severe, contraindicated)
   - Provides recommendations

5. Prescription linked to:
   - `Visit`
   - `Patient`
   - `prescribedBy` (Doctor)

6. Prescription can be:
   - Printed for patient
   - Sent digitally (email/SMS)
   - Marked as dispensed

**Models Involved:**
- `Prescription` - Prescription record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `Medicine` - Medicine catalog
- `User` - Prescribing doctor

**Status:**
- `status: 'active'` → `'dispensed'` → `'completed'`

**API Endpoints:**
- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions?prescribedBy=[id]` - Get doctor's prescriptions
- `GET /api/prescriptions/[id]` - Get prescription
- `PUT /api/prescriptions/[id]` - Update prescription
- `POST /api/prescriptions/check-interactions` - Check drug interactions
- `GET /api/prescriptions/[id]/print` - Print prescription

**Next Step:** Continue to Lab Tests, Imaging, or Document Visit

---

### 6. Order Lab Tests

**Process:**
1. During visit, doctor orders lab tests
2. Create lab order:
   - Select test type (e.g., CBC, Urinalysis)
   - Enter test code (LOINC code, optional)
   - Set urgency: `'routine'` | `'urgent'` | `'stat'`
   - Add special instructions
   - Mark fasting requirements
   - Add preparation notes

3. Lab order details:
   - Test type and description
   - Urgency level
   - Special instructions
   - Fasting requirements
   - Preparation notes

4. Third-party lab integration (optional):
   - Send order to external lab
   - Track order status
   - Receive results automatically

5. Lab order linked to:
   - `Visit`
   - `Patient`
   - `orderedBy` (Doctor)

6. Results entry (when available):
   - Results data entry
   - Reference ranges
   - Abnormal flags
   - Interpretation
   - Review and sign-off

**Models Involved:**
- `LabResult` - Lab result record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Ordering doctor, reviewing doctor

**Status:**
- `status: 'ordered'` → `'in-progress'` → `'completed'` → `'reviewed'`

**API Endpoints:**
- `POST /api/lab-results` - Create lab order
- `GET /api/lab-results?orderedBy=[id]` - Get doctor's lab orders
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result (enter results)
- `POST /api/lab-results/[id]/notify` - Notify patient of results
- `GET /api/lab-results/[id]/request-form` - Get request form

**Next Step:** Continue to Imaging, Procedures, or Document Visit

---

### 7. Order Imaging

**Process:**
1. During visit, doctor orders imaging
2. Create imaging order:
   - Select modality: X-ray, CT, MRI, Ultrasound, etc.
   - Specify body part
   - Add special instructions
   - Set urgency

3. Imaging order details:
   - Modality type
   - Body part
   - Order date
   - Special instructions

4. Results entry (when available):
   - Findings documentation
   - Impression/report
   - Images uploaded
   - Reported by radiologist

5. Imaging order linked to:
   - `Visit`
   - `Patient`
   - `orderedBy` (Doctor)
   - `reportedBy` (Radiologist, if different)

**Models Involved:**
- `Imaging` - Imaging record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Ordering doctor, reporting doctor
- `Attachment` - Image files

**Status:**
- `status: 'ordered'` → `'completed'` → `'reported'`

**API Endpoints:**
- `POST /api/imaging` - Create imaging order
- `GET /api/imaging?orderedBy=[id]` - Get doctor's imaging orders
- `GET /api/imaging/[id]` - Get imaging details
- `PUT /api/imaging/[id]` - Update imaging (enter findings)

**Next Step:** Continue to Procedures or Document Visit

---

### 8. Perform Procedures

**Process:**
1. During visit, doctor performs procedure
2. Create procedure record:
   - Select procedure type (minor surgery, wound care, IV insertion, etc.)
   - Document procedure details
   - Record outcome
   - Attach photos/documents

3. Procedure details:
   - Type of procedure
   - Date and time
   - Details and notes
   - Outcome documentation
   - Attachments

4. Procedure linked to:
   - `Visit`
   - `Patient`
   - `performedBy` (Doctor)

**Models Involved:**
- `Procedure` - Procedure record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Performing doctor
- `Attachment` - Procedure documentation

**API Endpoints:**
- `POST /api/procedures` - Create procedure record
- `GET /api/procedures?performedBy=[id]` - Get doctor's procedures
- `GET /api/procedures/[id]` - Get procedure details
- `PUT /api/procedures/[id]` - Update procedure

**Next Step:** Document & Sign Visit

---

### 9. Create Referrals

**Process:**
1. Doctor refers patient to specialist or external clinic
2. Create referral:
   - Select referral type: `'doctor_to_doctor'` | `'patient_to_patient'` | `'external'`
   - Select receiving doctor (if internal)
   - Enter receiving clinic (if external)
   - Set urgency: `'routine'` | `'urgent'` | `'stat'`
   - Enter reason for referral
   - Add clinical information

3. Referral details:
   - Chief complaint
   - Diagnosis
   - Relevant history
   - Current medications
   - Attachments (documents, images)

4. Referral linked to:
   - `Patient`
   - `referringDoctor` (Current doctor)
   - `receivingDoctor` (If internal)
   - `Visit` (Optional)
   - `Appointment` (Optional)

5. Referral tracking:
   - Status: `'pending'` → `'accepted'` → `'completed'`
   - Track acceptance and completion
   - Collect feedback

**Models Involved:**
- `Referral` - Referral record
- `Patient` - Patient reference
- `Doctor` - Referring and receiving doctors
- `Visit` - Linked visit (optional)
- `Appointment` - Linked appointment (optional)

**Status:**
- `status: 'pending'` → `'accepted'` → `'completed'`

**API Endpoints:**
- `POST /api/referrals` - Create referral
- `GET /api/referrals?referringDoctor=[id]` - Get doctor's referrals
- `GET /api/referrals/[id]` - Get referral
- `PUT /api/referrals/[id]` - Update referral
- `POST /api/referrals/[id]/accept` - Accept referral (receiving doctor)
- `POST /api/referrals/[id]/complete` - Complete referral

**Next Step:** Document & Sign Visit

---

### 10. Document & Sign Visit

**Process:**
1. Complete visit documentation:
   - Ensure all SOAP notes are complete
   - Verify diagnoses are documented (ICD-10 codes)
   - Confirm treatment plan is documented
   - Review all orders (prescriptions, labs, imaging, procedures)

2. Digital signature (optional but recommended):
   - Provider signs visit record
   - Signature data (Base64 encoded)
   - Timestamp recorded
   - IP address logged (for audit)

3. Close visit:
   - Set status: `'open'` → `'closed'`
   - Visit is finalized
   - Cannot be modified (unless reopened by admin)

4. Follow-up scheduling:
   - Schedule follow-up appointment if needed
   - Set follow-up date
   - Add follow-up instructions
   - Enable reminder notifications

**Models Involved:**
- `Visit` - Visit record with signature
- `User` - Signing doctor
- `Appointment` - Follow-up appointment (if created)

**Status:**
- `status: 'open'` → `'closed'`

**API Endpoints:**
- `PUT /api/visits/[id]` - Update visit (add signature, close)
- `POST /api/appointments` - Create follow-up appointment
- `GET /api/visits/[id]/print/medical-certificate` - Print medical certificate
- `GET /api/visits/[id]/print/lab-request` - Print lab request form

**Next Step:** View Patient History

---

### 11. View Patient History

**Process:**
1. Access patient history:
   - View all previous visits
   - Review past prescriptions
   - Check lab results history
   - View imaging history
   - Review procedures performed
   - Check referral history

2. Patient timeline:
   - Chronological view of all interactions
   - Filter by date range
   - Filter by type (visits, prescriptions, labs, etc.)
   - Search by diagnosis or condition

3. Medical history summary:
   - Pre-existing conditions
   - Allergies
   - Current medications
   - Family history
   - Social history

4. Quick access:
   - Recent visits
   - Active prescriptions
   - Pending lab results
   - Upcoming follow-ups

**Models Involved:**
- `Patient` - Patient record
- `Visit` - Visit history
- `Prescription` - Prescription history
- `LabResult` - Lab results history
- `Imaging` - Imaging history
- `Procedure` - Procedure history
- `Referral` - Referral history
- `Appointment` - Appointment history

**API Endpoints:**
- `GET /api/patients/[id]` - Get patient details
- `GET /api/visits?patientId=[id]` - Get patient visits
- `GET /api/prescriptions?patient=[id]` - Get patient prescriptions
- `GET /api/lab-results?patient=[id]` - Get patient lab results
- `GET /api/patients/[id]/history` - Get comprehensive patient history

**Next Step:** Track Performance

---

### 12. Track Performance & Productivity

**Process:**
1. View productivity dashboard:
   - Appointment metrics
   - Visit metrics
   - Prescription metrics
   - Revenue metrics
   - Time-based metrics

2. Appointment metrics:
   - Total appointments
   - Completed appointments
   - Cancelled appointments
   - No-show appointments
   - Scheduled appointments
   - Completion rate
   - No-show rate
   - Average appointments per day

3. Visit metrics:
   - Total visits
   - Completed visits
   - Open visits
   - Visit type breakdown
   - Average visits per day

4. Prescription metrics:
   - Total prescriptions
   - Active prescriptions
   - Dispensed prescriptions
   - Prescription status breakdown

5. Revenue metrics:
   - Total revenue
   - Total billed
   - Outstanding revenue
   - Revenue per visit

6. Time-based analysis:
   - Daily averages
   - Period summaries
   - Trend analysis
   - Performance comparisons

**Models Involved:**
- `Doctor` - Doctor profile with performance metrics
- `Appointment` - Appointment data
- `Visit` - Visit data
- `Prescription` - Prescription data
- `Invoice` - Revenue data

**API Endpoints:**
- `GET /api/doctors/[id]/productivity` - Get productivity report
- `GET /api/doctors/[id]/performance` - Get performance metrics
- `GET /api/reports/dashboard/role-based` - Doctor dashboard
- `GET /api/doctors/productivity` - All doctors productivity (admin only)

**Journey Continues:** Daily practice cycle repeats

---

## Daily Workflow Summary

### Morning Routine
1. **Login** - Access system
2. **View Dashboard** - Check today's appointments
3. **Review Schedule** - Confirm availability
4. **Check Queue** - See waiting patients

### During Consultations
1. **Start Visit** - Create visit record
2. **Review History** - Check patient's medical history
3. **Conduct Consultation** - Document SOAP notes
4. **Prescribe** - Create prescriptions
5. **Order Tests** - Order labs/imaging if needed
6. **Perform Procedures** - Document procedures
7. **Sign Visit** - Digital signature
8. **Close Visit** - Finalize visit

### End of Day
1. **Review Open Visits** - Complete any pending visits
2. **Check Follow-ups** - Schedule if needed
3. **Review Performance** - Check daily metrics
4. **Update Schedule** - Adjust for next day if needed

---

## Key Features for Doctors

### Dashboard
- Today's appointments overview
- Recent visits summary
- Quick stats (patients seen, prescriptions written)
- Pending tasks (open visits, lab results to review)
- Performance metrics

### Patient Management
- Quick patient search
- Patient history access
- Medical record viewing
- Allergy alerts
- Medication history

### Clinical Tools
- SOAP notes template
- ICD-10 code lookup
- Drug interaction checker
- Prescription templates
- Lab test catalog
- Imaging modality selection

### Documentation
- Digital signature
- Visit templates
- Quick notes
- Document upload
- Medical certificate generation

### Reporting
- Productivity reports
- Performance metrics
- Patient statistics
- Revenue reports
- Custom date ranges

---

## Status Summary

### Doctor Status
- `active` - Available for appointments
- `inactive` - Not available
- `on-leave` - On leave/vacation

### Visit Status
- `open` - Visit in progress
- `closed` - Visit completed
- `cancelled` - Visit cancelled

### Prescription Status
- `active` - Prescription active
- `dispensed` - Medication dispensed
- `completed` - Prescription completed
- `cancelled` - Prescription cancelled

### Lab Result Status
- `ordered` - Test ordered
- `in-progress` - Test in progress
- `completed` - Results available
- `reviewed` - Doctor reviewed results

### Appointment Status
- `pending` - Awaiting confirmation
- `scheduled` - Confirmed appointment
- `confirmed` - Patient confirmed
- `completed` - Appointment completed
- `cancelled` - Appointment cancelled
- `no-show` - Patient didn't show

---

## Data Model Relationships

```
Doctor
├── User Account (1:1)
├── Appointments (1:N)
│   └── Patient (N:1)
├── Visits (1:N)
│   ├── Patient (N:1)
│   ├── Prescriptions (1:N)
│   ├── LabResults (1:N)
│   ├── Imaging (1:N)
│   ├── Procedures (1:N)
│   └── Referrals (1:N)
├── Schedule (Embedded)
└── Performance Metrics (Embedded)

Visit
├── Doctor/Provider (N:1)
├── Patient (N:1)
├── Appointment (N:1, optional)
├── Prescriptions (1:N)
├── LabResults (1:N)
├── Imaging (1:N)
├── Procedures (1:N)
└── Digital Signature (Embedded)
```

---

## API Endpoint Summary

### Doctor Management
- `GET /api/doctors` - List doctors
- `GET /api/doctors/[id]` - Get doctor details
- `PUT /api/doctors/[id]` - Update doctor profile
- `GET /api/doctors/[id]/schedule` - Get schedule
- `PUT /api/doctors/[id]/schedule` - Update schedule

### Appointments
- `GET /api/appointments?doctorId=[id]` - Get doctor's appointments
- `GET /api/appointments?date=[date]` - Get appointments by date
- `GET /api/appointments/[id]` - Get appointment details
- `PUT /api/appointments/[id]` - Update appointment

### Visits
- `GET /api/visits?providerId=[id]` - Get doctor's visits
- `POST /api/visits` - Create visit
- `GET /api/visits/[id]` - Get visit details
- `PUT /api/visits/[id]` - Update visit
- `POST /api/visits/[id]/upload` - Upload documents

### Prescriptions
- `GET /api/prescriptions?prescribedBy=[id]` - Get doctor's prescriptions
- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions/[id]` - Get prescription
- `PUT /api/prescriptions/[id]` - Update prescription
- `POST /api/prescriptions/check-interactions` - Check interactions

### Lab Results
- `GET /api/lab-results?orderedBy=[id]` - Get doctor's lab orders
- `POST /api/lab-results` - Create lab order
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result

### Imaging
- `GET /api/imaging?orderedBy=[id]` - Get doctor's imaging orders
- `POST /api/imaging` - Create imaging order
- `GET /api/imaging/[id]` - Get imaging details
- `PUT /api/imaging/[id]` - Update imaging

### Procedures
- `GET /api/procedures?performedBy=[id]` - Get doctor's procedures
- `POST /api/procedures` - Create procedure
- `GET /api/procedures/[id]` - Get procedure details
- `PUT /api/procedures/[id]` - Update procedure

### Referrals
- `GET /api/referrals?referringDoctor=[id]` - Get doctor's referrals
- `POST /api/referrals` - Create referral
- `GET /api/referrals/[id]` - Get referral
- `PUT /api/referrals/[id]` - Update referral

### Reports & Analytics
- `GET /api/doctors/[id]/productivity` - Get productivity report
- `GET /api/doctors/[id]/performance` - Get performance metrics
- `GET /api/reports/dashboard/role-based` - Doctor dashboard

### Patient History
- `GET /api/patients/[id]` - Get patient details
- `GET /api/patients/[id]/history` - Get patient history
- `GET /api/visits?patientId=[id]` - Get patient visits

---

## Best Practices

1. **Complete Documentation**: Always complete SOAP notes before closing visit
2. **Digital Signatures**: Use digital signatures for legal compliance
3. **ICD-10 Codes**: Always include ICD-10 codes for diagnoses
4. **Drug Interactions**: Check drug interactions before prescribing
5. **Follow-ups**: Schedule follow-ups when needed
6. **Review Results**: Review lab/imaging results promptly
7. **Update Schedule**: Keep schedule updated for accurate availability
8. **Patient Communication**: Use system notifications for patient updates
9. **Performance Tracking**: Regularly review productivity metrics
10. **Data Security**: Maintain patient confidentiality (PH DPA compliance)

---

## Security & Compliance

### Access Control
- Role-based permissions
- Doctor can only access their own data
- Admin can view all doctors' data
- Audit trail for all actions

### Data Protection
- PH DPA compliance
- Encrypted data transmission
- Secure authentication
- Session management

### Audit Trail
- All actions logged
- User activity tracking
- Data access logs
- Compliance reporting

---

## Future Enhancements

- Teleconsultation support
- Mobile app for doctors
- AI-powered diagnosis suggestions
- Automated prescription generation
- Integration with external lab systems
- Real-time collaboration tools
- Advanced analytics and insights
- Voice-to-text documentation
- Clinical decision support systems

---

*Last Updated: 2024*
*Version: 1.0*

