# Entity Relationship Documentation

This document outlines all entity relationships in the clinic management system.

## Core Entities

### User
- **Model**: `User`
- **References**: 
  - Doctor (doctorProfile - optional, links to Doctor profile if role is doctor)
- **Referenced by**: 
  - Appointment (provider, createdBy)
  - Visit (provider, digitalSignature.providerId)
  - Prescription (prescribedBy, copies.patientCopy.printedBy, copies.clinicCopy.archivedBy)
  - LabResult (orderedBy, reviewedBy)
  - Imaging (orderedBy, reportedBy)
  - Procedure (performedBy)
  - Invoice (createdBy, discounts[].appliedBy, payments[].processedBy)
  - Attachment (uploadedBy)
  - AuditLog (userId)
  - Document (uploadedBy, lastModifiedBy)
  - Notification (user)
  - InventoryItem (lastRestockedBy)
  - Doctor (internalNotes[].createdBy)
  - Referral (feedback.submittedBy)

### Patient
- **Model**: `Patient`
- **References**: None (base entity)
- **Referenced by**:
  - Appointment (patient - required)
  - Visit (patient - required)
  - Prescription (patient - required)
  - LabResult (patient - required)
  - Imaging (patient - required)
  - Procedure (patient - required)
  - Invoice (patient - required)
  - Membership (patient - required, unique)
  - Queue (patient - required)
  - Referral (patient - required, referringPatient - optional)
  - Document (patient - optional)
  - AuditLog (dataSubject - optional, for PH DPA compliance)
- **Embedded**: Attachment (attachments array)

### Doctor
- **Model**: `Doctor`
- **References**: 
  - User (internalNotes[].createdBy)
- **Referenced by**:
  - Appointment (doctor - optional, can use provider/User instead)
  - Queue (doctor - optional)
  - Referral (referringDoctor, receivingDoctor - optional)
  - User (doctorProfile - optional, links User to Doctor profile)

## Clinical Entities

### Appointment
- **Model**: `Appointment`
- **References**:
  - Patient (required)
  - Doctor (optional)
  - User (provider - optional, createdBy - optional)
- **Indexes**: 
  - patient, status
  - doctor, appointmentDate
  - provider, scheduledAt
  - appointmentDate, appointmentTime
  - scheduledAt
  - status

### Visit
- **Model**: `Visit`
- **References**:
  - Patient (required)
  - User (provider - optional)
  - Prescription[] (prescriptions array)
  - LabResult[] (labsOrdered array)
  - Imaging[] (imagingOrdered array)
  - Procedure[] (proceduresPerformed array)
- **Indexes**:
  - patient, date
- **Embedded**: Attachment (attachments array)

### Prescription
- **Model**: `Prescription`
- **References**:
  - Visit (optional)
  - Patient (required)
  - User (prescribedBy - optional, copies.patientCopy.printedBy, copies.clinicCopy.archivedBy)
  - Medicine (medications[].medicineId - optional)
- **Indexes**:
  - patient, issuedAt
  - visit
  - prescribedBy
  - status
  - prescriptionCode

### LabResult
- **Model**: `LabResult`
- **References**:
  - Visit (optional)
  - Patient (required)
  - User (orderedBy - optional, reviewedBy - optional)
- **Indexes**:
  - patient, orderDate
  - visit
  - orderedBy
  - reviewedBy
  - status
  - requestCode
- **Embedded**: Attachment (attachments array)

### Imaging
- **Model**: `Imaging`
- **References**:
  - Visit (optional)
  - Patient (required)
  - User (orderedBy - optional, reportedBy - optional)
- **Indexes**:
  - patient, orderDate
  - visit
  - orderedBy
  - reportedBy
  - status
- **Embedded**: Attachment (images array)

### Procedure
- **Model**: `Procedure`
- **References**:
  - Visit (optional)
  - Patient (required)
  - User (performedBy - optional)
- **Indexes**:
  - patient, date
  - visit
  - performedBy
- **Embedded**: Attachment (attachments array)

## Billing Entity

### Invoice
- **Model**: `Invoice`
- **References**:
  - Patient (required)
  - Visit (optional)
  - User (createdBy - optional, discounts[].appliedBy, payments[].processedBy)
  - Service (items[].serviceId - optional)
- **Indexes**:
  - patient, createdAt
  - visit
  - status
  - invoiceNumber
  - createdBy

## Supporting Entities

### Attachment
- **Model**: `Attachment`
- **References**:
  - User (uploadedBy - optional)
- **Usage**: Embedded in Patient, Visit, LabResult, Imaging, Procedure

### Document
- **Model**: `Document`
- **References**:
  - Patient (optional)
  - Visit (optional)
  - Appointment (optional)
  - LabResult (optional)
  - Invoice (optional)
  - User (uploadedBy - required, lastModifiedBy - optional)
- **Indexes**:
  - patient, category, status
  - category, status
  - tags
  - title, description, ocrText (full-text search)
  - uploadDate
  - expiryDate
  - uploadedBy
  - lastModifiedBy
  - documentCode

### Notification
- **Model**: `Notification`
- **References**:
  - User (user - required)
- **Indexes**:
  - user, read, createdAt
  - user, type, read
  - expiresAt (TTL index)

### Membership
- **Model**: `Membership`
- **References**:
  - Patient (patient - required, unique)
  - Patient (referredBy - optional, referrals[] - array)
- **Indexes**:
  - patient (unique)
  - membershipNumber (unique)
  - tier, status
  - points
  - expiryDate

### Queue
- **Model**: `Queue`
- **References**:
  - Patient (patient - required)
  - Appointment (appointment - optional)
  - Visit (visit - optional)
  - Doctor (doctor - optional)
  - Room (room - optional)
- **Indexes**:
  - queueNumber (unique)
  - status, priority, queuedAt
  - doctor, status, priority
  - room, status
  - checkedIn, status
  - qrCode

### Referral
- **Model**: `Referral`
- **References**:
  - Doctor (referringDoctor, receivingDoctor - optional)
  - Patient (patient - required, referringPatient - optional)
  - Visit (visit - optional)
  - Appointment (appointment - optional)
  - User (feedback.submittedBy - optional)
- **Indexes**:
  - referralCode (unique)
  - referringDoctor, status
  - receivingDoctor, status
  - patient, status
  - status, referredDate
  - type, status
  - feedback.submittedBy

### Service
- **Model**: `Service`
- **References**: None (catalog entity)
- **Referenced by**:
  - Invoice (items[].serviceId - optional)
- **Indexes**:
  - code (unique)
  - category, active
  - name, description (full-text search)

### Medicine
- **Model**: `Medicine`
- **References**: None (catalog entity)
- **Referenced by**:
  - Prescription (medications[].medicineId - optional)
  - InventoryItem (medicineId - optional)
- **Indexes**:
  - name, genericName, brandNames (full-text search)
  - category, active

### InventoryItem
- **Model**: `InventoryItem`
- **References**:
  - Medicine (medicineId - optional)
  - User (lastRestockedBy - optional)
- **Indexes**:
  - category, status
  - name (full-text search)
  - status
  - expiryDate
  - medicineId
  - lastRestockedBy

### Room
- **Model**: `Room`
- **References**: None (catalog entity)
- **Referenced by**:
  - Queue (room - optional)
  - Appointment (room - string field, not reference)
- **Indexes**:
  - name (unique)
  - roomType, status
  - status

### AuditLog
- **Model**: `AuditLog`
- **References**:
  - User (userId - required)
  - Patient (dataSubject - optional, for PH DPA compliance)
- **Indexes**:
  - userId, timestamp
  - resource, resourceId, timestamp
  - action, timestamp
  - dataSubject, timestamp
  - isSensitive, timestamp
  - timestamp
  - success

## Relationship Summary

### One-to-Many Relationships
- User → Appointments (as provider/createdBy)
- User → Visits (as provider)
- User → Prescriptions (as prescribedBy)
- User → LabResults (as orderedBy/reviewedBy)
- User → Imaging (as orderedBy/reportedBy)
- User → Procedures (as performedBy)
- User → Invoices (as createdBy)
- User → Attachments (as uploadedBy)
- User → AuditLogs (as userId)
- User → Documents (as uploadedBy/lastModifiedBy)
- User → Notifications (as user)
- User → InventoryItems (as lastRestockedBy)
- User → Doctor Notes (as internalNotes[].createdBy)
- User → Referral Feedback (as feedback.submittedBy)

- Patient → Appointments
- Patient → Visits
- Patient → Prescriptions
- Patient → LabResults
- Patient → Imaging
- Patient → Procedures
- Patient → Invoices
- Patient → Memberships (one-to-one, unique)
- Patient → Queue Entries
- Patient → Referrals (as patient or referringPatient)
- Patient → Documents
- Patient → AuditLogs (as dataSubject)

- Doctor → Appointments (optional)
- Doctor → Queue Entries (optional)
- Doctor → Referrals (as referringDoctor/receivingDoctor)

- Visit → Prescriptions
- Visit → LabResults
- Visit → Imaging
- Visit → Procedures
- Visit → Invoices
- Visit → Documents
- Visit → Queue Entries
- Visit → Referrals

- Service → Invoice Items (optional)
- Medicine → Prescription Medications (optional)
- Medicine → InventoryItems (optional)
- Room → Queue Entries (optional)

### Many-to-One Relationships
- Appointment → Patient (required)
- Appointment → Doctor (optional)
- Appointment → User (provider/createdBy, optional)

- Visit → Patient (required)
- Visit → User (provider, optional)

- Prescription → Visit (optional)
- Prescription → Patient (required)
- Prescription → User (prescribedBy, optional)

- LabResult → Visit (optional)
- LabResult → Patient (required)
- LabResult → User (orderedBy/reviewedBy, optional)

- Imaging → Visit (optional)
- Imaging → Patient (required)
- Imaging → User (orderedBy/reportedBy, optional)

- Procedure → Visit (optional)
- Procedure → Patient (required)
- Procedure → User (performedBy, optional)

- Invoice → Patient (required)
- Invoice → Visit (optional)
- Invoice → User (createdBy, optional)
- Invoice → Service (items[].serviceId, optional)

- Membership → Patient (required, unique)
- Membership → Patient (referredBy, optional)
- Membership → Patient[] (referrals array)

- Queue → Patient (required)
- Queue → Appointment (optional)
- Queue → Visit (optional)
- Queue → Doctor (optional)
- Queue → Room (optional)

- Referral → Patient (required)
- Referral → Doctor (referringDoctor/receivingDoctor, optional)
- Referral → Visit (optional)
- Referral → Appointment (optional)
- Referral → User (feedback.submittedBy, optional)

- Document → Patient (optional)
- Document → Visit (optional)
- Document → Appointment (optional)
- Document → LabResult (optional)
- Document → Invoice (optional)
- Document → User (uploadedBy, required)

- Notification → User (required)

- InventoryItem → Medicine (medicineId, optional)
- InventoryItem → User (lastRestockedBy, optional)

## Notes

1. **Appointment Model**: Supports both `doctor` (Doctor model) and `provider` (User model) for flexibility. At least one must be provided.

2. **Visit Model**: Central entity that links to multiple clinical records (prescriptions, labs, imaging, procedures).

3. **Attachment Model**: Used as embedded documents in multiple models (Patient, Visit, LabResult, Imaging, Procedure).

4. **User Model**: Used for authentication and can represent doctors, admins, or other staff members. The `role` field distinguishes between user types. Can link to a Doctor profile via `doctorProfile` field.

5. **AuditLog Model**: Uses `userId` field (not `performedBy`) to reference the User who performed the action. Also tracks `dataSubject` (Patient ID) for PH DPA compliance.

6. **Membership Model**: One-to-one relationship with Patient (unique constraint). Supports referral tracking with `referredBy` and `referrals` array.

7. **Queue Model**: Manages patient queue for appointments and walk-ins. Can reference Appointment, Visit, Doctor, and Room.

8. **Referral Model**: Supports doctor-to-doctor, patient-to-patient, and external referrals. Can link to Visit and Appointment when referral is accepted.

9. **Document Model**: Centralized document management that can be associated with multiple entities (Patient, Visit, Appointment, LabResult, Invoice).

10. **Service & Medicine Models**: Catalog entities referenced by Invoice and Prescription respectively.

11. **InventoryItem Model**: Tracks clinic inventory, can reference Medicine catalog and User who restocked.

12. **Indexes**: All foreign key references and commonly queried fields are indexed for optimal query performance.

13. **Timestamps**: All models include `createdAt` and `updatedAt` timestamps automatically managed by Mongoose.

