# Entity Relationship Documentation

This document outlines all entity relationships in the clinic management system.

## Core Entities

### User
- **Model**: `User`
- **References**: None (base entity)
- **Referenced by**: 
  - Appointment (provider, createdBy)
  - Visit (provider)
  - Prescription (prescribedBy)
  - LabResult (orderedBy, reviewedBy)
  - Imaging (orderedBy, reportedBy)
  - Procedure (performedBy)
  - Invoice (createdBy)
  - Attachment (uploadedBy)
  - AuditLog (performedBy)

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
- **Embedded**: Attachment (attachments array)

### Doctor
- **Model**: `Doctor`
- **References**: None (base entity)
- **Referenced by**:
  - Appointment (doctor - optional, can use provider/User instead)

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
  - User (prescribedBy - optional)
- **Indexes**:
  - patient, issuedAt
  - visit
  - prescribedBy
  - status

### LabResult
- **Model**: `LabResult` (previously exported as 'Lab' - fixed)
- **References**:
  - Visit (optional)
  - Patient (required)
  - User (orderedBy - optional, reviewedBy - optional)
- **Indexes**:
  - patient, orderDate
  - visit
  - orderedBy
  - status
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
  - User (createdBy - optional)
- **Indexes**:
  - patient, createdAt
  - visit
  - status
  - invoiceNumber

## Supporting Entities

### Attachment
- **Model**: `Attachment`
- **References**:
  - User (uploadedBy - optional)
- **Usage**: Embedded in Patient, Visit, LabResult, Imaging, Procedure

### AuditLog
- **Model**: `AuditLog`
- **References**:
  - User (performedBy - optional)
- **Indexes**:
  - collectionName, documentId
  - performedBy, timestamp
  - timestamp

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
- User → AuditLogs (as performedBy)

- Patient → Appointments
- Patient → Visits
- Patient → Prescriptions
- Patient → LabResults
- Patient → Imaging
- Patient → Procedures
- Patient → Invoices

- Doctor → Appointments (optional)

- Visit → Prescriptions
- Visit → LabResults
- Visit → Imaging
- Visit → Procedures
- Visit → Invoices

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

## Notes

1. **Appointment Model**: Supports both `doctor` (Doctor model) and `provider` (User model) for flexibility. At least one must be provided.

2. **Visit Model**: Central entity that links to multiple clinical records (prescriptions, labs, imaging, procedures).

3. **Attachment Model**: Used as embedded documents in multiple models (Patient, Visit, LabResult, Imaging, Procedure).

4. **User Model**: Used for authentication and can represent doctors, admins, or other staff members. The `role` field distinguishes between user types.

5. **Indexes**: All foreign key references and commonly queried fields are indexed for optimal query performance.

6. **Timestamps**: All models include `createdAt` and `updatedAt` timestamps automatically managed by Mongoose.

