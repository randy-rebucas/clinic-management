# Compliance & Philippine Data Privacy Act (PH DPA) Guide

## Overview

MyClinicSoft implements comprehensive data privacy and security measures to comply with the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)** and its implementing rules and regulations.

---

## Table of Contents

1. [PH DPA Overview](#ph-dpa-overview)
2. [Data Privacy Principles](#data-privacy-principles)
3. [Patient Rights](#patient-rights)
4. [Data Protection Implementation](#data-protection-implementation)
5. [Consent Management](#consent-management)
6. [Data Retention & Deletion](#data-retention--deletion)
7. [Breach Notification](#breach-notification)
8. [Compliance Checklist](#compliance-checklist)
9. [Privacy Impact Assessment](#privacy-impact-assessment)

---

## PH DPA Overview

### Key Requirements

The Philippine Data Privacy Act requires healthcare organizations to:

✅ **Transparency** - Inform data subjects about data collection and processing  
✅ **Legitimate Purpose** - Process data only for declared, specified purposes  
✅ **Proportionality** - Collect only necessary data  
✅ **Security** - Implement appropriate organizational and technical security measures  
✅ **Rights Protection** - Respect data subject rights (access, correction, deletion)  
✅ **Accountability** - Demonstrate compliance with the law  

### Definitions

- **Personal Information (PI)**: Any information from which identity can be reasonably ascertained
- **Sensitive Personal Information (SPI)**: Includes health, medical, genetic data
- **Personal Information Controller (PIC)**: Entity that controls data processing (the clinic)
- **Personal Information Processor (PIP)**: Entity that processes data on behalf of PIC
- **Data Subject**: Individual whom the data refers to (patients, staff)

---

## Data Privacy Principles

### 1. Transparency Principle

**Implementation**:
```typescript
// Privacy notice displayed to patients
const PRIVACY_NOTICE = {
  purpose: 'Clinical care, billing, appointment reminders',
  legalBasis: 'Consent, contract, legal obligation',
  dataCollected: [
    'Personal details (name, contact, birthdate)',
    'Medical history and clinical records',
    'Payment and billing information',
    'Appointment and visit records'
  ],
  sharingPolicy: 'Not shared without consent except as required by law',
  retentionPeriod: '10 years from last visit',
  rights: 'Access, correction, deletion, portability, objection'
};
```

**Location**: Displayed during patient registration

### 2. Legitimate Purpose Principle

**Purposes for Data Processing**:
- ✅ **Primary Purpose**: Provision of healthcare services
- ✅ **Secondary Purposes**: 
  - Billing and payment processing
  - Appointment scheduling and reminders
  - Quality improvement and analytics
  - Legal and regulatory compliance

**Implementation**:
```typescript
// Track purpose for each data access
await createAuditLog({
  userId: session.userId,
  action: 'read',
  resource: 'patient',
  resourceId: patientId,
  purpose: 'clinical_care', // or 'billing', 'scheduling', 'compliance'
  metadata: { reason: 'Patient consultation' }
});
```

### 3. Proportionality Principle

**Data Minimization**:
```typescript
// Only collect necessary fields
const PatientSchema = new Schema({
  // Required for care
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  sex: { type: String, required: true },
  
  // Optional but justified
  email: { type: String }, // For appointment reminders
  phone: { type: String }, // For urgent contact
  address: { type: Object }, // For service location
  
  // Sensitive - only if clinically relevant
  civilStatus: { type: String }, // Optional
  occupation: { type: String }, // Optional
  emergencyContact: { type: Object } // For emergencies
});
```

### 4. Security Measures

See [SECURITY_AUTHENTICATION.md](./SECURITY_AUTHENTICATION.md) for detailed implementation.

**Key Measures**:
- 🔒 Encryption at rest and in transit
- 🔐 Role-based access control
- 🔑 Multi-factor authentication (optional)
- 📝 Comprehensive audit logging
- 🛡️ Regular security audits
- 💾 Encrypted backups

---

## Patient Rights

### Right to Information

**What**: Patients must be informed about data collection

**Implementation**:
```typescript
// Display privacy notice before first visit
export async function showPrivacyNotice(patientId: string) {
  const patient = await Patient.findById(patientId);
  
  if (!patient.privacyNoticeShown) {
    // Show notice and record acknowledgment
    patient.privacyNoticeShown = true;
    patient.privacyNoticeDate = new Date();
    await patient.save();
    
    await createAuditLog({
      userId: 'system',
      action: 'privacy_notice_shown',
      resource: 'patient',
      resourceId: patientId
    });
  }
}
```

### Right to Access

**What**: Patients can request copies of their records

**API Endpoint**: `GET /api/patient-portal/records`

**Implementation**:
```typescript
export async function GET(req: NextRequest) {
  const session = await requireAuth(); // Patient authentication
  
  // Verify patient identity
  const patient = await Patient.findOne({
    _id: session.userId,
    tenantId: session.tenantId
  });
  
  // Return patient's own records
  const records = {
    personalInfo: patient.toObject(),
    visits: await Visit.find({ patient: patient._id }),
    prescriptions: await Prescription.find({ patient: patient._id }),
    labResults: await LabResult.find({ patient: patient._id }),
    invoices: await Invoice.find({ patient: patient._id })
  };
  
  // Log access request
  await createAuditLog({
    userId: session.userId,
    action: 'data_access_request',
    resource: 'patient',
    resourceId: patient._id
  });
  
  return NextResponse.json({ records });
}
```

### Right to Correction

**What**: Patients can request correction of inaccurate data

**API Endpoint**: `PATCH /api/patient-portal/profile`

**Implementation**:
```typescript
export async function PATCH(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();
  
  // Validate correction request
  const allowedFields = ['email', 'phone', 'address', 'emergencyContact'];
  const updates = {};
  
  for (const field of allowedFields) {
    if (body[field]) {
      updates[field] = body[field];
    }
  }
  
  // Update patient record
  const patient = await Patient.findByIdAndUpdate(
    session.userId,
    updates,
    { new: true }
  );
  
  // Log correction
  await createAuditLog({
    userId: session.userId,
    action: 'data_correction',
    resource: 'patient',
    resourceId: patient._id,
    metadata: { fields: Object.keys(updates) }
  });
  
  return NextResponse.json({ success: true, patient });
}
```

### Right to Erasure (Right to be Forgotten)

**What**: Patients can request deletion of their data

**API Endpoint**: `POST /api/compliance/data-deletion`

**Implementation**:
```typescript
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const { patientId, reason } = await req.json();
  
  // Verify authorization
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  // Check for legal retention requirements
  const patient = await Patient.findById(patientId);
  const lastVisit = await Visit.findOne({ patient: patientId })
    .sort({ visitDate: -1 });
  
  const retentionPeriod = 10 * 365 * 24 * 60 * 60 * 1000; // 10 years
  const canDelete = !lastVisit || 
    (Date.now() - lastVisit.visitDate.getTime() > retentionPeriod);
  
  if (!canDelete) {
    return NextResponse.json({ 
      error: 'Cannot delete: Legal retention period not met' 
    }, { status: 400 });
  }
  
  // Create deletion request (queue for processing)
  const deletionRequest = await DeletionRequest.create({
    patientId,
    requestedBy: session.userId,
    reason,
    status: 'pending',
    scheduledDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  });
  
  // Notify patient of pending deletion
  await sendEmail({
    to: patient.email,
    subject: 'Data Deletion Request Received',
    body: `Your data deletion request has been received. 
           Your data will be permanently deleted in 30 days.
           To cancel, contact us immediately.`
  });
  
  // Log deletion request
  await createAuditLog({
    userId: session.userId,
    action: 'data_deletion_requested',
    resource: 'patient',
    resourceId: patientId,
    metadata: { reason, scheduledDate: deletionRequest.scheduledDate }
  });
  
  return NextResponse.json({ 
    success: true, 
    deletionRequest 
  });
}
```

### Right to Data Portability

**What**: Patients can receive their data in structured, machine-readable format

**API Endpoint**: `GET /api/patient-portal/export`

**Implementation**:
```typescript
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const format = req.nextUrl.searchParams.get('format') || 'json';
  
  // Gather all patient data
  const patient = await Patient.findById(session.userId);
  const visits = await Visit.find({ patient: session.userId });
  const prescriptions = await Prescription.find({ patient: session.userId });
  const labResults = await LabResult.find({ patient: session.userId });
  
  const exportData = {
    exportDate: new Date().toISOString(),
    patient: patient.toObject(),
    medicalHistory: {
      visits: visits.map(v => v.toObject()),
      prescriptions: prescriptions.map(p => p.toObject()),
      labResults: labResults.map(l => l.toObject())
    }
  };
  
  // Log export
  await createAuditLog({
    userId: session.userId,
    action: 'data_export',
    resource: 'patient',
    resourceId: patient._id,
    metadata: { format }
  });
  
  if (format === 'csv') {
    // Convert to CSV
    const csv = convertToCSV(exportData);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="medical-records-${patient._id}.csv"`
      }
    });
  }
  
  // Return JSON
  return NextResponse.json(exportData, {
    headers: {
      'Content-Disposition': `attachment; filename="medical-records-${patient._id}.json"`
    }
  });
}
```

### Right to Object

**What**: Patients can object to certain data processing

**Implementation**:
```typescript
// Allow patients to opt-out of non-essential processing
const patient = await Patient.findByIdAndUpdate(patientId, {
  'dataProcessingConsent.marketing': false,
  'dataProcessingConsent.research': false,
  'dataProcessingConsent.analytics': false
});

// Essential processing cannot be opted out while receiving care
const essentialConsent = {
  clinicalCare: true, // Required
  billing: true, // Required
  legalCompliance: true // Required
};
```

---

## Data Protection Implementation

### Encryption

**Data at Rest**:
```typescript
// Encrypt sensitive fields
import { encrypt, decrypt } from '@/lib/encryption';

const PatientSchema = new Schema({
  firstName: String,
  lastName: String,
  
  // Encrypted fields
  ssn: {
    type: String,
    get: decrypt,
    set: encrypt
  },
  medicalHistory: {
    type: String,
    get: decrypt,
    set: encrypt
  }
});
```

**Data in Transit**:
- All communications use HTTPS/TLS
- API calls require secure connections
- No plain-text transmission of sensitive data

### Access Control

```typescript
// Implement strict access control
export async function requirePatientAccess(
  patientId: string,
  session: Session
) {
  // Admin can access all
  if (session.role === 'admin') return true;
  
  // Doctor/Nurse can access assigned patients
  if (['doctor', 'nurse'].includes(session.role)) {
    const hasAccess = await checkClinicalAssignment(
      session.userId,
      patientId
    );
    return hasAccess;
  }
  
  // Patient can access own records
  if (session.userId === patientId) {
    return true;
  }
  
  throw new Error('Access denied');
}
```

### Audit Trail

All access to sensitive data is logged:

```typescript
// Log every access to patient records
await createAuditLog({
  userId: session.userId,
  userEmail: session.email,
  action: 'read',
  resource: 'patient',
  resourceId: patientId,
  ipAddress: req.headers.get('x-forwarded-for'),
  userAgent: req.headers.get('user-agent'),
  timestamp: new Date(),
  metadata: {
    purpose: 'clinical_review',
    accessPath: req.url
  }
});
```

---

## Consent Management

### Consent Types

```typescript
interface ConsentRecord {
  patientId: string;
  consentType: 'treatment' | 'data_processing' | 'marketing' | 'research';
  granted: boolean;
  grantedDate?: Date;
  revokedDate?: Date;
  version: string; // Policy version
  signature?: string; // Digital signature
  witness?: string;
}
```

### Obtaining Consent

```typescript
// Record consent during registration
export async function recordConsent(
  patientId: string,
  consentType: string,
  granted: boolean
) {
  const consent = await Consent.create({
    patientId,
    consentType,
    granted,
    grantedDate: granted ? new Date() : undefined,
    version: PRIVACY_POLICY_VERSION,
    ipAddress: req.headers.get('x-forwarded-for')
  });
  
  await createAuditLog({
    userId: patientId,
    action: 'consent_recorded',
    resource: 'consent',
    resourceId: consent._id,
    metadata: { consentType, granted }
  });
  
  return consent;
}
```

### Withdrawing Consent

```typescript
export async function withdrawConsent(
  patientId: string,
  consentType: string
) {
  const consent = await Consent.findOneAndUpdate(
    { patientId, consentType },
    {
      granted: false,
      revokedDate: new Date()
    },
    { new: true }
  );
  
  // Stop related processing
  if (consentType === 'marketing') {
    await unsubscribeFromMarketing(patientId);
  }
  
  await createAuditLog({
    userId: patientId,
    action: 'consent_withdrawn',
    resource: 'consent',
    resourceId: consent._id
  });
}
```

---

## Data Retention & Deletion

### Retention Periods

```typescript
const RETENTION_PERIODS = {
  medicalRecords: 10 * 365, // 10 years (DOH requirement)
  billingRecords: 7 * 365,  // 7 years (BIR requirement)
  auditLogs: 5 * 365,       // 5 years
  consentRecords: 10 * 365, // 10 years
  marketingData: 2 * 365    // 2 years
};
```

### Automated Deletion

```typescript
// Cron job: app/api/cron/data-retention/route.ts
export async function POST(req: NextRequest) {
  // Verify cron secret
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const today = new Date();
  
  // Delete marketing data older than 2 years
  const marketingCutoff = new Date(today.getTime() - RETENTION_PERIODS.marketingData * 24 * 60 * 60 * 1000);
  await MarketingData.deleteMany({
    createdAt: { $lt: marketingCutoff }
  });
  
  // Anonymize old audit logs (keep for compliance but remove PII)
  const auditCutoff = new Date(today.getTime() - RETENTION_PERIODS.auditLogs * 24 * 60 * 60 * 1000);
  await AuditLog.updateMany(
    { timestamp: { $lt: auditCutoff } },
    { $unset: { userEmail: 1, ipAddress: 1, userAgent: 1 } }
  );
  
  // Process pending deletion requests
  const pendingDeletions = await DeletionRequest.find({
    status: 'pending',
    scheduledDate: { $lte: today }
  });
  
  for (const deletion of pendingDeletions) {
    await executePatientDeletion(deletion.patientId);
    deletion.status = 'completed';
    deletion.completedDate = new Date();
    await deletion.save();
  }
  
  return NextResponse.json({ 
    success: true,
    deletedMarketing: marketingCount,
    anonymizedLogs: auditCount,
    processedDeletions: pendingDeletions.length
  });
}
```

### Patient Data Deletion Process

```typescript
async function executePatientDeletion(patientId: string) {
  // 1. Archive essential records (for legal compliance)
  const archiveData = {
    patientId,
    deletionDate: new Date(),
    retainedData: {
      // Keep minimal data for legal purposes
      visitDates: await Visit.find({ patient: patientId }).select('visitDate'),
      billingRecords: await Invoice.find({ patient: patientId }).select('date amount')
    }
  };
  
  await Archive.create(archiveData);
  
  // 2. Delete patient data
  await Promise.all([
    Patient.findByIdAndDelete(patientId),
    Visit.deleteMany({ patient: patientId }),
    Prescription.deleteMany({ patient: patientId }),
    LabResult.deleteMany({ patient: patientId }),
    Appointment.deleteMany({ patient: patientId }),
    Queue.deleteMany({ patient: patientId }),
    Notification.deleteMany({ userId: patientId })
  ]);
  
  // 3. Log deletion
  await createAuditLog({
    userId: 'system',
    action: 'patient_deleted',
    resource: 'patient',
    resourceId: patientId,
    metadata: { archived: true }
  });
}
```

---

## Breach Notification

### Breach Detection

```typescript
// Monitor for potential breaches
export async function detectBreach() {
  // Check for unusual access patterns
  const suspiciousAccess = await AuditLog.aggregate([
    {
      $match: {
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
        resources: { $addToSet: '$resource' }
      }
    },
    {
      $match: {
        count: { $gt: 100 } // More than 100 accesses/day
      }
    }
  ]);
  
  if (suspiciousAccess.length > 0) {
    await notifySecurityTeam({
      type: 'suspicious_access',
      users: suspiciousAccess
    });
  }
}
```

### Breach Response Procedure

When a breach is detected:

1. **Immediate Actions** (Within 1 hour):
   - Contain the breach
   - Secure systems
   - Document incident

2. **Assessment** (Within 72 hours):
   - Determine scope
   - Identify affected data
   - Assess risk to data subjects

3. **Notification** (Within 72 hours to NPC):
   ```typescript
   export async function notifyNPC(breachDetails: BreachIncident) {
     // Prepare NPC notification
     const notification = {
       incidentDate: breachDetails.detectedDate,
       natureOfBreach: breachDetails.description,
       typeOfData: breachDetails.affectedDataTypes,
       numberOfSubjects: breachDetails.affectedCount,
       consequencesAnalysis: breachDetails.impact,
       measuresTaken: breachDetails.remediation,
       contactPerson: process.env.DPO_CONTACT
     };
     
     // Send to National Privacy Commission
     // https://privacy.gov.ph/data-breach-notification/
     
     // Log notification
     await createAuditLog({
       userId: 'system',
       action: 'breach_notification_sent',
       resource: 'compliance',
       metadata: notification
     });
   }
   ```

4. **Data Subject Notification** (Without undue delay):
   ```typescript
   export async function notifyAffectedPatients(
     affectedPatientIds: string[]
   ) {
     for (const patientId of affectedPatientIds) {
       const patient = await Patient.findById(patientId);
       
       await sendEmail({
         to: patient.email,
         subject: 'Important: Data Breach Notification',
         body: `
           We are writing to inform you of a data security incident 
           that may have affected your personal information.
           
           What happened: [Description]
           What data was affected: [Data types]
           What we're doing: [Actions taken]
           What you can do: [Recommendations]
           
           For questions, contact: ${process.env.DPO_CONTACT}
         `
       });
     }
   }
   ```

---

## Compliance Checklist

### Initial Setup
- [ ] Appoint Data Protection Officer (DPO)
- [ ] Register with National Privacy Commission
- [ ] Conduct Privacy Impact Assessment
- [ ] Develop privacy policies and notices
- [ ] Implement technical security measures
- [ ] Train staff on data privacy

### Ongoing Compliance
- [ ] Display privacy notices to patients
- [ ] Obtain and record consent
- [ ] Implement access controls
- [ ] Maintain audit logs
- [ ] Conduct regular security audits
- [ ] Review and update privacy policies annually
- [ ] Process data subject requests within 30 days
- [ ] Report breaches to NPC within 72 hours

### Technical Requirements
- [ ] Encryption at rest and in transit
- [ ] Role-based access control
- [ ] Comprehensive audit logging
- [ ] Secure backup procedures
- [ ] Data retention policies implemented
- [ ] Automated data deletion
- [ ] Breach detection mechanisms
- [ ] Incident response plan

### Documentation
- [ ] Privacy Policy
- [ ] Terms of Service
- [ ] Consent forms
- [ ] Data Processing Agreements
- [ ] Records of Processing Activities
- [ ] Privacy Impact Assessments
- [ ] Breach response procedures
- [ ] Staff training records

---

## Privacy Impact Assessment

### Assessment Template

```markdown
# Privacy Impact Assessment

**Date**: [Date]
**Assessor**: [Name]
**System**: MyClinicSoft v1.0

## 1. Description of Processing
- **Purpose**: Clinical management system
- **Data Collected**: Patient medical records, SPI
- **Data Subjects**: Patients, staff
- **Recipients**: Healthcare providers, billing staff

## 2. Necessity and Proportionality
- All data necessary for healthcare delivery
- Minimized to essential information
- Retention periods comply with legal requirements

## 3. Risks to Rights and Freedoms
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unauthorized access | Medium | High | RBAC, encryption, audit logs |
| Data breach | Low | High | Security measures, monitoring |
| Loss of data | Low | High | Encrypted backups, redundancy |

## 4. Compliance Measures
- Encryption: AES-256
- Access control: Role-based
- Audit trail: All access logged
- Consent management: Implemented
- Data subject rights: API endpoints created

## 5. Sign-off
**DPO Approval**: [Signature]
**Date**: [Date]
```

---

## Contacts & Resources

### Data Protection Officer (DPO)
- **Email**: dpo@clinic.com
- **Phone**: +63-XXX-XXX-XXXX

### National Privacy Commission
- **Website**: https://privacy.gov.ph
- **Hotline**: 1-8888 (option 3)
- **Email**: info@privacy.gov.ph

### Resources
- [PH DPA Full Text](https://www.privacy.gov.ph/data-privacy-act/)
- [NPC Advisories](https://www.privacy.gov.ph/advisories/)
- [Breach Notification](https://www.privacy.gov.ph/data-breach-notification/)

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0  
**Next Review**: August 14, 2026
