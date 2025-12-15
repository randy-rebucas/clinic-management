# Security & Compliance System

This document describes the Security & Compliance features implemented in MyClinicSoft, including role-based access control, audit trails, data encryption, backups, and PH Data Privacy Act alignment.

## Features Overview

### 1. Role-Based Access Control (RBAC)

The system implements comprehensive role-based access control with permissions.

**Roles:**
- **Admin** - Full system access
- **Doctor** - Clinical access
- **Nurse** - Clinical support
- **Receptionist** - Front desk operations
- **Accountant** - Financial access

**Permission System:**
- Default permissions per role
- Custom permissions per user
- Resource-based permissions (patients, visits, appointments, etc.)
- Action-based permissions (read, write, update, delete)

**Implementation:**
- `lib/permissions.ts` - Permission definitions
- `app/lib/auth-helpers.ts` - Permission checking utilities
- `models/User.ts` - User roles and permissions

### 2. Audit Trail

Comprehensive audit logging of all user actions for compliance and security.

**AuditLog Model:**
```typescript
{
  userId: ObjectId,
  userEmail: string,
  userRole: string,
  action: AuditAction, // create, read, update, delete, login, etc.
  resource: AuditResource, // patient, visit, appointment, etc.
  resourceId: ObjectId,
  ipAddress: string,
  userAgent: string,
  requestMethod: string,
  requestPath: string,
  changes: [{ field, oldValue, newValue }],
  description: string,
  success: boolean,
  isSensitive: boolean,
  dataSubject: ObjectId, // Patient ID for PH DPA
  timestamp: Date
}
```

**Audited Actions:**
- User login/logout
- Data access (read)
- Data modification (create, update, delete)
- Access denied attempts
- Password changes
- Permission changes
- Data exports
- Data deletions
- Backups and restores

**API Endpoints:**
- `GET /api/audit-logs` - View audit logs (admin only)
  - Query params: `userId`, `resource`, `resourceId`, `action`, `dataSubject`, `startDate`, `endDate`, `isSensitive`
- `GET /api/audit-logs/patient-access` - View patient data access history (PH DPA compliance)

**Usage:**
```javascript
import { createAuditLog, logDataAccess, logDataModification } from '@/lib/audit';

// Log data access
await logDataAccess(
  userId,
  userEmail,
  userRole,
  'patient',
  patientId,
  patientId, // dataSubject
  ipAddress,
  userAgent,
  requestPath
);

// Log data modification
await logDataModification(
  userId,
  userEmail,
  userRole,
  'patient',
  patientId,
  changes,
  patientId, // dataSubject
  ipAddress,
  requestPath
);
```

### 3. Data Encryption

Sensitive data encryption using AES-256-GCM.

**Encryption Features:**
- AES-256-GCM encryption algorithm
- Secure key management via environment variables
- Field-level encryption
- Data masking for display

**Environment Variable:**
```env
ENCRYPTION_KEY=your-256-bit-hex-key-or-password
```

**Usage:**
```javascript
import { encryptData, decryptData, maskSensitiveData } from '@/lib/encryption';

// Encrypt sensitive data
const encrypted = encryptData('sensitive information');

// Decrypt data
const decrypted = decryptData(encrypted);

// Mask data for display
const masked = maskSensitiveData('1234567890', 4); // Shows: ******7890
```

**Encryption Utilities:**
- `encryptData()` - Encrypt string data
- `decryptData()` - Decrypt encrypted data
- `hashData()` - One-way hash (for passwords)
- `verifyHash()` - Verify hashed data
- `maskSensitiveData()` - Mask sensitive data for display
- `encryptObjectFields()` - Encrypt multiple object fields
- `decryptObjectFields()` - Decrypt multiple object fields

### 4. Daily Backups

Automated backup system for database protection.

**Backup Features:**
- Full database backup
- JSON export format
- Collection-level backup
- Backup metadata
- Audit logging of backups

**API Endpoints:**
- `GET /api/backups` - Create and download backup (admin only)
- `POST /api/backups` - Restore from backup (admin only)

**Backup Format:**
```json
{
  "timestamp": "2024-01-15T10:00:00.000Z",
  "version": "1.0",
  "collections": ["patients", "visits", "appointments"],
  "totalDocuments": 1000,
  "data": {
    "patients": [...],
    "visits": [...],
    ...
  }
}
```

**Production Recommendations:**
- Schedule daily backups via cron job
- Store backups in secure cloud storage (S3, Azure Blob, etc.)
- Encrypt backup files
- Test restore procedures regularly
- Keep multiple backup versions
- Off-site backup storage

**Cron Job Example:**
```javascript
// In vercel.json or cron job
{
  "crons": [{
    "path": "/api/backups",
    "schedule": "0 2 * * *" // Daily at 2 AM
  }]
}
```

### 5. PH Data Privacy Act (DPA) Alignment

Compliance features for Philippine Data Privacy Act of 2012 (RA 10173).

**PH DPA Rights Implementation:**

#### Right to Access
- Patients can request access to their data
- API: `GET /api/audit-logs/patient-access?patientId=...`
- Shows all access to patient data

#### Right to Data Portability
- Patients can export their data
- API: `POST /api/compliance/data-export`
- Exports all patient data in JSON format

#### Right to be Forgotten
- Patients can request data deletion/anonymization
- API: `POST /api/compliance/data-deletion`
- Two modes: anonymize (recommended) or delete

#### Data Subject Tracking
- All patient data access is logged with `dataSubject` field
- Sensitive data access marked with `isSensitive: true`
- Audit trail for compliance reporting

**Compliance Features:**
- **Data Subject Identification**: All patient data access tracked
- **Access Logging**: Complete audit trail of who accessed what
- **Data Export**: Structured data export for portability
- **Data Deletion**: Secure data anonymization/deletion
- **Consent Management**: Track patient consent (can be extended)
- **Breach Notification**: Audit logs enable breach detection

**API Endpoints:**
- `POST /api/compliance/data-export` - Export patient data
- `POST /api/compliance/data-deletion` - Delete/anonymize patient data

**Data Export Example:**
```javascript
POST /api/compliance/data-export
{
  "patientId": "123"
}

Response: JSON file with all patient data
```

**Data Deletion Example:**
```javascript
POST /api/compliance/data-deletion
{
  "patientId": "123",
  "mode": "anonymize", // or "delete"
  "reason": "Patient request",
  "confirm": "DELETE"
}
```

## Security Best Practices

### 1. Authentication & Authorization
- ✅ JWT-based session management
- ✅ Password hashing with bcrypt
- ✅ Role-based access control
- ✅ Permission checking on all API routes
- ✅ Session expiration (7 days)

### 2. Data Protection
- ✅ Encryption for sensitive data
- ✅ Secure file storage (Cloudinary)
- ✅ HTTPS enforcement in production
- ✅ Input validation and sanitization
- ✅ SQL injection prevention (MongoDB)

### 3. Audit & Monitoring
- ✅ Comprehensive audit logging
- ✅ Access tracking
- ✅ Failed access attempt logging
- ✅ Data modification tracking
- ✅ Compliance reporting

### 4. Backup & Recovery
- ✅ Automated backup system
- ✅ Backup audit logging
- ✅ Restore functionality
- ✅ Backup verification

### 5. Compliance
- ✅ PH DPA rights implementation
- ✅ Data subject tracking
- ✅ Access history
- ✅ Data export capability
- ✅ Data deletion capability

## Environment Variables

### Encryption
```env
ENCRYPTION_KEY=your-256-bit-hex-key-or-password
```

Generate a secure key:
```bash
openssl rand -hex 32
```

### Session Security
```env
SESSION_SECRET=your-session-secret-key
```

Generate a secure secret:
```bash
openssl rand -base64 32
```

## Audit Log Retention

**Recommended Retention:**
- **Active Logs**: 1 year
- **Archived Logs**: 7 years (for compliance)
- **Sensitive Access**: Permanent (for PH DPA)

**Implementation:**
- Use MongoDB TTL index for automatic cleanup
- Archive old logs to cold storage
- Maintain separate archive for compliance

## Compliance Reporting

### Access Report
```javascript
GET /api/audit-logs?dataSubject={patientId}&isSensitive=true
```

### Export Report
```javascript
GET /api/audit-logs?action=data_export&dataSubject={patientId}
```

### Deletion Report
```javascript
GET /api/audit-logs?action=data_deletion&dataSubject={patientId}
```

## Future Enhancements

- **Two-Factor Authentication (2FA)**
- **IP Whitelisting**
- **Rate Limiting**
- **Intrusion Detection**
- **Security Alerts**
- **Compliance Dashboard**
- **Automated Compliance Reports**
- **Data Breach Detection**
- **Consent Management System**
- **Privacy Policy Tracking**
- **Data Processing Agreements**
- **Third-Party Data Sharing Logs**

