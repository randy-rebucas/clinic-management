# Nurse Journey - Start to Finish

## Overview
This document outlines the complete nurse journey through MyClinicSoft, covering patient care support, vital signs recording, visit assistance, and clinical documentation.

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
│ 2. VIEW         │
│   SCHEDULE      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. PATIENT      │
│   CHECK-IN      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. RECORD       │
│   VITALS        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. ASSIST       │
│   VISIT         │
└────────┬────────┘
         │
         ├──► 6. UPDATE LAB RESULTS
         ├──► 7. ASSIST PROCEDURES
         │
         ▼
┌─────────────────┐
│ 8. DOCUMENT     │
│   CARE          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 9. TRACK        │
│   ACTIVITY      │
└─────────────────┘
```

---

## Detailed Journey Steps

### 1. Nurse Onboarding & Setup

**Entry Point:**
- Admin creates nurse profile via staff management

**Process:**
1. Admin creates `Nurse` record with:
   - Personal Information: firstName, lastName, email, phone
   - Professional Info: licenseNumber, department, specialization
   - Employee ID
   - Qualifications (RN, LPN, etc.)
   - Title and bio

2. System automatically:
   - Creates `User` account linked to nurse profile
   - Assigns 'nurse' role
   - Generates default password
   - Sets status: `'active'`

3. Nurse receives:
   - Login credentials
   - Account activation instructions
   - First-time login prompts password change

4. Initial setup:
   - Nurse logs in and changes password
   - Completes profile information
   - Reviews permissions and access

**Models Involved:**
- `Nurse` - Nurse profile
- `User` - User account (auto-created)
- `Role` - Nurse role assignment

**Status:**
- `status: 'active'` | `'inactive'` | `'on-leave'`

**API Endpoints:**
- `POST /api/staff` (type: 'nurse') - Create nurse (admin only)
- `GET /api/staff?type=nurse` - List nurses
- `GET /api/staff/[id]` - Get nurse details
- `PUT /api/staff/[id]` - Update nurse profile

**Next Step:** View Schedule

---

### 2. View Schedule & Appointments

**Process:**
1. View dashboard:
   - Today's appointments
   - Patient queue
   - Upcoming visits
   - Quick stats

2. View schedule:
   - Daily schedule
   - Assigned patients
   - Room assignments
   - Doctor assignments

3. Appointment overview:
   - Today's appointments
   - Patient information
   - Visit status
   - Priority patients

**Models Involved:**
- `Appointment` - Appointment records
- `Queue` - Queue management
- `Patient` - Patient information

**API Endpoints:**
- `GET /api/appointments` - List appointments
- `GET /api/queue` - Get queue
- `GET /api/reports/dashboard/role-based` - Nurse dashboard

**Next Step:** Patient Check-in

---

### 3. Patient Check-in

**Process:**
1. Patient arrives:
   - Verify patient identity
   - Check appointment status
   - Confirm patient information

2. Check-in process:
   - Manual check-in via system
   - QR code check-in (if available)
   - Kiosk check-in (if available)

3. Queue management:
   - Add patient to queue
   - Assign queue number
   - Update appointment status
   - Notify doctor

4. Pre-visit preparation:
   - Review patient history
   - Check allergies
   - Prepare room
   - Gather equipment

**Models Involved:**
- `Queue` - Queue management
- `Appointment` - Appointment record
- `Patient` - Patient information

**API Endpoints:**
- `POST /api/queue` - Add to queue
- `POST /api/queue/[id]/check-in` - Check-in patient
- `PUT /api/queue/[id]` - Update queue status
- `GET /api/patients/[id]` - Get patient details

**Next Step:** Record Vitals

---

### 4. Record Vital Signs

**Process:**
1. Measure vital signs:
   - Blood Pressure (BP)
   - Heart Rate (HR)
   - Respiratory Rate (RR)
   - Temperature
   - SpO2 (Oxygen Saturation)
   - Height and Weight
   - Calculate BMI

2. Record in system:
   - Enter vitals in visit record
   - Verify measurements
   - Note any abnormalities
   - Add relevant notes

3. Vital signs data:
   - BP: Systolic/Diastolic (e.g., 120/80)
   - HR: Beats per minute
   - RR: Breaths per minute
   - Temperature: Celsius
   - SpO2: Percentage
   - Height: Centimeters
   - Weight: Kilograms
   - BMI: Calculated automatically

4. Alert system:
   - Flag abnormal values
   - Notify doctor if critical
   - Document concerns

**Models Involved:**
- `Visit` - Visit record with vitals
- `Patient` - Patient information

**API Endpoints:**
- `POST /api/visits` - Create visit (with vitals)
- `PUT /api/visits/[id]` - Update visit vitals
- `GET /api/visits/[id]` - Get visit details

**Next Step:** Assist Visit

---

### 5. Assist Visit

**Process:**
1. Prepare for visit:
   - Review patient chart
   - Prepare examination room
   - Gather necessary supplies
   - Ensure equipment is ready

2. Assist doctor during visit:
   - Support during examination
   - Assist with procedures
   - Document as needed
   - Provide patient care

3. Patient care:
   - Comfort patient
   - Explain procedures
   - Answer questions
   - Provide education

4. Documentation support:
   - Assist with SOAP notes
   - Document procedures
   - Record observations
   - Update visit status

**Models Involved:**
- `Visit` - Visit record
- `Patient` - Patient information
- `Procedure` - Procedure records

**API Endpoints:**
- `GET /api/visits/[id]` - Get visit details
- `PUT /api/visits/[id]` - Update visit
- `POST /api/procedures` - Create procedure record

**Next Steps:** Update Lab Results, Assist Procedures

---

### 6. Update Lab Results

**Process:**
1. Receive lab results:
   - Results from lab
   - External lab results
   - Manual entry of results

2. Enter results:
   - Input test values
   - Reference ranges
   - Abnormal flags
   - Interpretation notes

3. Results documentation:
   - Structured data entry
   - Attach result documents
   - Flag critical values
   - Date and time stamp

4. Notify doctor:
   - Alert doctor of results
   - Flag urgent results
   - Schedule review

5. Patient notification (if enabled):
   - Send results to patient
   - Schedule follow-up if needed

**Models Involved:**
- `LabResult` - Lab result record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Nurse updating results

**Status:**
- `status: 'ordered'` → `'in-progress'` → `'completed'` → `'reviewed'`

**API Endpoints:**
- `GET /api/lab-results` - List lab results
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result
- `POST /api/lab-results/[id]/upload` - Upload results

**Next Step:** Assist Procedures

---

### 7. Assist Procedures

**Process:**
1. Prepare for procedure:
   - Gather equipment
   - Prepare patient
   - Set up procedure area
   - Ensure sterility

2. Assist during procedure:
   - Support doctor
   - Monitor patient
   - Handle equipment
   - Document procedure

3. Procedure documentation:
   - Record procedure type
   - Document details
   - Note outcome
   - Attach photos/documents

4. Post-procedure care:
   - Monitor patient
   - Provide instructions
   - Schedule follow-up
   - Document care

**Models Involved:**
- `Procedure` - Procedure record
- `Visit` - Linked visit
- `Patient` - Patient reference
- `User` - Nurse assisting

**API Endpoints:**
- `POST /api/procedures` - Create procedure record
- `GET /api/procedures` - List procedures
- `GET /api/procedures/[id]` - Get procedure details
- `PUT /api/procedures/[id]` - Update procedure

**Next Step:** Document Care

---

### 8. Document Care

**Process:**
1. Nursing notes:
   - Document patient care
   - Record observations
   - Note patient responses
   - Document interventions

2. Care documentation:
   - Patient assessment
   - Care provided
   - Patient education
   - Follow-up instructions

3. Update visit record:
   - Add nursing notes
   - Update visit status
   - Document completion
   - Sign off on care

4. Documentation standards:
   - Clear and concise
   - Timely documentation
   - Accurate information
   - Professional language

**Models Involved:**
- `Visit` - Visit record
- `Patient` - Patient information
- `User` - Nurse documenting

**API Endpoints:**
- `PUT /api/visits/[id]` - Update visit with notes
- `GET /api/visits/[id]` - Get visit details

**Next Step:** Track Activity

---

### 9. Track Activity & Performance

**Process:**
1. View activity summary:
   - Patients seen today
   - Vitals recorded
   - Procedures assisted
   - Lab results updated

2. Performance metrics:
   - Total visits assisted
   - Completed visits
   - Cancelled visits
   - Activity statistics

3. Review dashboard:
   - Daily summary
   - Recent activities
   - Upcoming tasks
   - Performance trends

**Models Involved:**
- `Nurse` - Nurse profile with metrics
- `Visit` - Visit data
- `LabResult` - Lab result data
- `Procedure` - Procedure data

**API Endpoints:**
- `GET /api/reports/dashboard/role-based` - Nurse dashboard
- `GET /api/staff/[id]` - Get nurse metrics

---

## Key Features for Nurses

### Dashboard
- Today's appointments overview
- Patient queue
- Recent visits
- Quick stats
- Pending tasks

### Patient Management
- Patient search
- Patient history access
- Allergy alerts
- Medical record viewing

### Clinical Tools
- Vital signs recording
- Lab result entry
- Procedure documentation
- Care notes

### Documentation
- Nursing notes
- Care documentation
- Visit updates
- Procedure records

---

## Daily Workflow Summary

### Morning Routine
1. **Login** - Access nurse dashboard
2. **Review Schedule** - Check today's appointments
3. **Check Queue** - See waiting patients
4. **Prepare Rooms** - Set up examination rooms

### During Day
1. **Patient Check-in** - Check in arriving patients
2. **Record Vitals** - Measure and record vital signs
3. **Assist Visits** - Support doctor during consultations
4. **Update Results** - Enter lab results
5. **Assist Procedures** - Support procedures
6. **Document Care** - Record nursing care

### End of Day
1. **Complete Documentation** - Finish all notes
2. **Review Activity** - Check daily summary
3. **Prepare Next Day** - Review tomorrow's schedule

---

## Status Summary

### Nurse Status
- `active` - Available for duty
- `inactive` - Not available
- `on-leave` - On leave/vacation

### Visit Status
- `open` - Visit in progress
- `closed` - Visit completed
- `cancelled` - Visit cancelled

### Lab Result Status
- `ordered` - Test ordered
- `in-progress` - Test in progress
- `completed` - Results available
- `reviewed` - Doctor reviewed

---

## API Endpoint Summary

### Appointments & Queue
- `GET /api/appointments` - List appointments
- `GET /api/queue` - Get queue
- `POST /api/queue` - Add to queue
- `POST /api/queue/[id]/check-in` - Check-in patient

### Visits
- `GET /api/visits` - List visits
- `POST /api/visits` - Create visit
- `GET /api/visits/[id]` - Get visit
- `PUT /api/visits/[id]` - Update visit

### Lab Results
- `GET /api/lab-results` - List lab results
- `GET /api/lab-results/[id]` - Get lab result
- `PUT /api/lab-results/[id]` - Update lab result
- `POST /api/lab-results/[id]/upload` - Upload results

### Procedures
- `GET /api/procedures` - List procedures
- `POST /api/procedures` - Create procedure
- `GET /api/procedures/[id]` - Get procedure
- `PUT /api/procedures/[id]` - Update procedure

### Patients
- `GET /api/patients` - List patients
- `GET /api/patients/[id]` - Get patient
- `GET /api/patients/[id]/history` - Get patient history

---

## Best Practices

1. **Accurate Documentation**: Record all care accurately and timely
2. **Vital Signs**: Measure and record vitals consistently
3. **Patient Safety**: Always verify patient identity
4. **Communication**: Communicate clearly with doctors and patients
5. **Confidentiality**: Maintain patient privacy (PH DPA compliance)
6. **Professionalism**: Maintain professional standards
7. **Teamwork**: Collaborate effectively with healthcare team
8. **Continuous Learning**: Stay updated on best practices

---

*Last Updated: 2024*
*Version: 1.0*

