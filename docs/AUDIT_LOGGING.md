# Audit Logging System Guide

## Overview

MyClinicSoft implements comprehensive audit logging for compliance, security monitoring, and operational tracking. All access to patient data and system changes are logged.

---

## Table of Contents

1. [Audit Log Architecture](#audit-log-architecture)
2. [What Gets Logged](#what-gets-logged)
3. [Audit Log Implementation](#audit-log-implementation)
4. [Querying Audit Logs](#querying-audit-logs)
5. [Compliance Reporting](#compliance-reporting)
6. [Retention & Archival](#retention--archival)
7. [Security & Monitoring](#security--monitoring)

---

## Audit Log Architecture

### Database Model

**Location**: `models/AuditLog.ts`

```typescript
interface IAuditLog {
  // Who
  userId: Types.ObjectId;
  userEmail: string;
  userRole?: string;
  
  // What
  action: 'create' | 'read' | 'update' | 'delete' | 'export' | 'login' | 'logout';
  resource: string; // 'patient', 'visit', 'prescription', etc.
  resourceId?: Types.ObjectId;
  
  // When
  timestamp: Date;
  
  // Where
  ipAddress?: string;
  userAgent?: string;
  tenantId?: Types.ObjectId;
  
  // Why
  purpose?: string; // 'clinical_care', 'billing', 'audit', etc.
  
  // Context
  metadata?: Record<string, any>;
  changes?: {
    before?: any;
    after?: any;
  };
  
  // Result
  status: 'success' | 'failure';
  error?: string;
}
```

### Log Levels

```typescript
enum AuditLevel {
  CRITICAL = 'critical',  // Security events, breaches
  HIGH = 'high',          // Data modifications, deletions
  MEDIUM = 'medium',      // Data access, exports
  LOW = 'low'             // Logins, system events
  INFO = 'info'           // General operations
}
```

---

## What Gets Logged

### Patient Data Access

✅ **Always Logged**:
- Viewing patient records
- Accessing medical history
- Viewing prescriptions
- Accessing lab results
- Viewing billing information
- Exporting patient data

```typescript
// Example: Logging patient record access
await createAuditLog({
  userId: session.userId,
  userEmail: session.email,
  userRole: session.role,
  action: 'read',
  resource: 'patient',
  resourceId: patientId,
  timestamp: new Date(),
  ipAddress: req.headers.get('x-forwarded-for'),
  userAgent: req.headers.get('user-agent'),
  tenantId: session.tenantId,
  purpose: 'clinical_care',
  status: 'success'
});
```

### Data Modifications

✅ **Changes Tracked**:
- Creating records
- Updating records
- Deleting records
- Status changes

```typescript
// Example: Logging record update with changes
const before = patient.toObject();
patient.email = newEmail;
await patient.save();
const after = patient.toObject();

await createAuditLog({
  userId: session.userId,
  userEmail: session.email,
  action: 'update',
  resource: 'patient',
  resourceId: patientId,
  changes: {
    before: { email: before.email },
    after: { email: after.email }
  },
  status: 'success'
});
```

### Administrative Actions

✅ **Admin Activity Logged**:
- User management (create, modify, delete users)
- Role/permission changes
- System configuration changes
- Tenant management
- Backup operations

```typescript
// Example: Logging user creation
await createAuditLog({
  userId: session.userId,
  userEmail: session.email,
  action: 'create',
  resource: 'user',
  resourceId: newUser._id,
  metadata: {
    newUserEmail: newUser.email,
    role: newUser.role,
    tenantId: newUser.tenantId
  },
  status: 'success'
});
```

### Authentication Events

✅ **Auth Events Logged**:
- Login attempts (success/failure)
- Logout
- Session expiration
- Password changes
- Failed authentication attempts

```typescript
// Example: Logging login attempt
await createAuditLog({
  userId: user._id,
  userEmail: email,
  action: 'login',
  resource: 'auth',
  timestamp: new Date(),
  ipAddress: req.headers.get('x-forwarded-for'),
  userAgent: req.headers.get('user-agent'),
  status: loginSuccessful ? 'success' : 'failure',
  error: loginSuccessful ? undefined : 'Invalid credentials'
});
```

### Compliance Events

✅ **Compliance Logged**:
- Consent granted/withdrawn
- Privacy notice shown
- Data export requests
- Data deletion requests
- Breach notifications

```typescript
// Example: Logging consent
await createAuditLog({
  userId: patientId,
  userEmail: patient.email,
  action: 'update',
  resource: 'consent',
  metadata: {
    consentType: 'data_processing',
    granted: true,
    policyVersion: '1.0'
  },
  status: 'success'
});
```

---

## Audit Log Implementation

### Core Function

**Location**: `lib/audit.ts`

```typescript
import AuditLog from '@/models/AuditLog';
import { getTenantContext } from '@/lib/dal';

interface AuditLogEntry {
  userId: string | Types.ObjectId;
  userEmail: string;
  userRole?: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'export' | 'login' | 'logout';
  resource: string;
  resourceId?: string | Types.ObjectId;
  purpose?: string;
  metadata?: Record<string, any>;
  changes?: {
    before?: any;
    after?: any;
  };
  status?: 'success' | 'failure';
  error?: string;
}

export async function createAuditLog(entry: AuditLogEntry) {
  try {
    // Get tenant context if not provided
    let tenantId = entry.metadata?.tenantId;
    if (!tenantId) {
      const tenantContext = await getTenantContext();
      tenantId = tenantContext.tenantId;
    }
    
    // Get request context
    const req = await getRequest(); // Helper to get current request
    
    await AuditLog.create({
      ...entry,
      timestamp: new Date(),
      ipAddress: req?.headers.get('x-forwarded-for') || 
                 req?.headers.get('x-real-ip') ||
                 'unknown',
      userAgent: req?.headers.get('user-agent') || 'unknown',
      tenantId,
      status: entry.status || 'success'
    });
  } catch (error) {
    // Never throw - logging failures shouldn't break app
    console.error('Failed to create audit log:', error);
  }
}
```

### Middleware Integration

```typescript
// Automatic logging middleware for API routes
export function withAuditLog(
  handler: Function,
  options: {
    resource: string;
    action: string;
    getResourceId?: (req: NextRequest) => string;
  }
) {
  return async (req: NextRequest, ...args: any[]) => {
    const session = await getServerSession();
    const startTime = Date.now();
    let result;
    let error;
    
    try {
      result = await handler(req, ...args);
      return result;
    } catch (e) {
      error = e;
      throw e;
    } finally {
      // Log after request completes
      await createAuditLog({
        userId: session?.userId || 'anonymous',
        userEmail: session?.email || 'anonymous',
        userRole: session?.role,
        action: options.action,
        resource: options.resource,
        resourceId: options.getResourceId?.(req),
        status: error ? 'failure' : 'success',
        error: error?.message,
        metadata: {
          duration: Date.now() - startTime,
          method: req.method,
          url: req.url
        }
      });
    }
  };
}

// Usage
export const GET = withAuditLog(
  async (req: NextRequest) => {
    const patients = await Patient.find();
    return NextResponse.json({ patients });
  },
  {
    resource: 'patient',
    action: 'read'
  }
);
```

### Bulk Logging

```typescript
// For operations affecting multiple records
export async function createBulkAuditLogs(
  entries: AuditLogEntry[]
) {
  try {
    const logs = entries.map(entry => ({
      ...entry,
      timestamp: new Date(),
      status: entry.status || 'success'
    }));
    
    await AuditLog.insertMany(logs);
  } catch (error) {
    console.error('Failed to create bulk audit logs:', error);
  }
}

// Usage: Bulk patient export
const patientIds = [/* ... */];
await createBulkAuditLogs(
  patientIds.map(id => ({
    userId: session.userId,
    userEmail: session.email,
    action: 'export',
    resource: 'patient',
    resourceId: id,
    purpose: 'data_portability'
  }))
);
```

---

## Querying Audit Logs

### API Endpoint

**Location**: `app/api/audit-logs/route.ts`

```typescript
export async function GET(req: NextRequest) {
  const session = await requireAuth();
  
  // Only admins can view all audit logs
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  
  const searchParams = req.nextUrl.searchParams;
  
  // Build query
  const query: any = {
    tenantId: session.tenantId
  };
  
  // Filter by user
  if (searchParams.get('userId')) {
    query.userId = new Types.ObjectId(searchParams.get('userId'));
  }
  
  // Filter by resource
  if (searchParams.get('resource')) {
    query.resource = searchParams.get('resource');
  }
  
  // Filter by action
  if (searchParams.get('action')) {
    query.action = searchParams.get('action');
  }
  
  // Filter by date range
  if (searchParams.get('startDate')) {
    query.timestamp = {
      $gte: new Date(searchParams.get('startDate'))
    };
  }
  if (searchParams.get('endDate')) {
    query.timestamp = {
      ...query.timestamp,
      $lte: new Date(searchParams.get('endDate'))
    };
  }
  
  // Pagination
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const skip = (page - 1) * limit;
  
  // Execute query
  const logs = await AuditLog.find(query)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'name email')
    .lean();
  
  const total = await AuditLog.countDocuments(query);
  
  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}
```

### Common Queries

```typescript
// Get all access to a specific patient
const patientAccessLogs = await AuditLog.find({
  resource: 'patient',
  resourceId: patientId,
  action: 'read'
}).sort({ timestamp: -1 });

// Get all failed login attempts in last 24 hours
const failedLogins = await AuditLog.find({
  resource: 'auth',
  action: 'login',
  status: 'failure',
  timestamp: {
    $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
  }
});

// Get all data modifications by a user
const userActions = await AuditLog.find({
  userId,
  action: { $in: ['create', 'update', 'delete'] }
}).sort({ timestamp: -1 });

// Get suspicious activity (many accesses in short time)
const suspiciousActivity = await AuditLog.aggregate([
  {
    $match: {
      timestamp: {
        $gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
      }
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
      count: { $gt: 100 } // More than 100 accesses/hour
    }
  }
]);
```

---

## Compliance Reporting

### Patient Access History

```typescript
// Generate patient access report
export async function generatePatientAccessReport(
  patientId: string,
  startDate: Date,
  endDate: Date
) {
  const logs = await AuditLog.find({
    resource: 'patient',
    resourceId: patientId,
    timestamp: { $gte: startDate, $lte: endDate }
  })
  .populate('userId', 'name email role')
  .sort({ timestamp: -1 })
  .lean();
  
  return {
    patientId,
    reportPeriod: { start: startDate, end: endDate },
    totalAccesses: logs.length,
    accessesByUser: groupBy(logs, 'userId'),
    accessesByAction: groupBy(logs, 'action'),
    timeline: logs.map(log => ({
      date: log.timestamp,
      user: log.userId.name,
      action: log.action,
      ipAddress: log.ipAddress
    }))
  };
}
```

### User Activity Report

```typescript
// Generate user activity report
export async function generateUserActivityReport(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  const logs = await AuditLog.find({
    userId,
    timestamp: { $gte: startDate, $lte: endDate }
  }).sort({ timestamp: -1 }).lean();
  
  return {
    userId,
    reportPeriod: { start: startDate, end: endDate },
    totalActions: logs.length,
    actionsByType: groupBy(logs, 'action'),
    resourcesAccessed: groupBy(logs, 'resource'),
    failedAttempts: logs.filter(l => l.status === 'failure').length,
    timeline: logs
  };
}
```

### Security Incident Report

```typescript
// Generate security incident report
export async function generateSecurityReport(
  startDate: Date,
  endDate: Date
) {
  const failedLogins = await AuditLog.countDocuments({
    resource: 'auth',
    action: 'login',
    status: 'failure',
    timestamp: { $gte: startDate, $lte: endDate }
  });
  
  const unauthorizedAccess = await AuditLog.find({
    status: 'failure',
    error: { $regex: /unauthorized|forbidden|access denied/i },
    timestamp: { $gte: startDate, $lte: endDate }
  });
  
  const suspiciousPatterns = await AuditLog.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          userId: '$userId',
          hour: { $hour: '$timestamp' }
        },
        count: { $sum: 1 }
      }
    },
    {
      $match: {
        count: { $gt: 50 } // More than 50 actions/hour
      }
    }
  ]);
  
  return {
    reportPeriod: { start: startDate, end: endDate },
    failedLogins,
    unauthorizedAccessAttempts: unauthorizedAccess.length,
    suspiciousActivity: suspiciousPatterns,
    recommendations: generateSecurityRecommendations(suspiciousPatterns)
  };
}
```

---

## Retention & Archival

### Retention Policy

```typescript
const AUDIT_LOG_RETENTION = {
  active: 90 * 24 * 60 * 60 * 1000,      // 90 days in DB
  archived: 5 * 365 * 24 * 60 * 60 * 1000 // 5 years in archive
};
```

### Archival Process

```typescript
// Cron job: Archive old audit logs
export async function archiveOldLogs() {
  const archiveCutoff = new Date(
    Date.now() - AUDIT_LOG_RETENTION.active
  );
  
  // Find logs to archive
  const logsToArchive = await AuditLog.find({
    timestamp: { $lt: archiveCutoff }
  }).lean();
  
  if (logsToArchive.length === 0) return;
  
  // Compress and archive
  const archived = await compressAndArchive(logsToArchive);
  
  // Store in cold storage (S3, Azure Blob, etc.)
  await uploadToArchive(archived, {
    filename: `audit-logs-${archiveCutoff.toISOString()}.json.gz`,
    retention: AUDIT_LOG_RETENTION.archived
  });
  
  // Delete from active database
  await AuditLog.deleteMany({
    timestamp: { $lt: archiveCutoff }
  });
  
  console.log(`Archived ${logsToArchive.length} audit logs`);
}
```

### Data Anonymization

```typescript
// Anonymize old logs (remove PII but keep for analytics)
export async function anonymizeOldLogs() {
  const anonymizeCutoff = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000 // 1 year
  );
  
  await AuditLog.updateMany(
    { timestamp: { $lt: anonymizeCutoff } },
    {
      $set: {
        userEmail: '[REDACTED]',
        ipAddress: '[REDACTED]',
        userAgent: '[REDACTED]'
      }
    }
  );
}
```

---

## Security & Monitoring

### Real-time Monitoring

```typescript
// Monitor for suspicious activity
export async function monitorAuditLogs() {
  // Check for brute force attacks
  const recentFailedLogins = await AuditLog.aggregate([
    {
      $match: {
        resource: 'auth',
        action: 'login',
        status: 'failure',
        timestamp: {
          $gte: new Date(Date.now() - 15 * 60 * 1000) // Last 15 min
        }
      }
    },
    {
      $group: {
        _id: '$userEmail',
        count: { $sum: 1 },
        ips: { $addToSet: '$ipAddress' }
      }
    },
    {
      $match: {
        count: { $gte: 5 } // 5 or more failed attempts
      }
    }
  ]);
  
  if (recentFailedLogins.length > 0) {
    await alertSecurityTeam({
      type: 'brute_force_detected',
      accounts: recentFailedLogins
    });
  }
  
  // Check for data exfiltration
  const largeExports = await AuditLog.find({
    action: 'export',
    timestamp: {
      $gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
    }
  });
  
  if (largeExports.length > 10) {
    await alertSecurityTeam({
      type: 'unusual_export_activity',
      exports: largeExports
    });
  }
}
```

### Integrity Protection

```typescript
// Add cryptographic hash to logs for tamper detection
export async function createAuditLogWithHash(entry: AuditLogEntry) {
  const logData = {
    ...entry,
    timestamp: new Date()
  };
  
  // Generate hash
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(logData))
    .digest('hex');
  
  const log = await AuditLog.create({
    ...logData,
    hash
  });
  
  return log;
}

// Verify log integrity
export async function verifyLogIntegrity(logId: string) {
  const log = await AuditLog.findById(logId).lean();
  
  const { hash, ...logData } = log;
  const calculatedHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(logData))
    .digest('hex');
  
  return hash === calculatedHash;
}
```

---

## Best Practices

### What to Log
✅ **Always log:**
- All access to sensitive data
- All data modifications
- Authentication events
- Administrative actions
- Failed operations
- Compliance events

❌ **Never log:**
- Passwords or secrets
- Full credit card numbers
- Complete SSNs
- Sensitive medical details (log access, not content)

### Performance Considerations

```typescript
// Use async logging to avoid blocking
export async function logAsync(entry: AuditLogEntry) {
  // Don't await - fire and forget
  createAuditLog(entry).catch(err => {
    console.error('Audit log failed:', err);
  });
}

// Batch logging for high-volume operations
const logBuffer: AuditLogEntry[] = [];

export function bufferLog(entry: AuditLogEntry) {
  logBuffer.push(entry);
  
  if (logBuffer.length >= 100) {
    flushLogBuffer();
  }
}

async function flushLogBuffer() {
  if (logBuffer.length === 0) return;
  
  const entries = [...logBuffer];
  logBuffer.length = 0;
  
  await createBulkAuditLogs(entries);
}

// Flush on interval
setInterval(flushLogBuffer, 10000); // Every 10 seconds
```

### Error Handling

```typescript
// Never let logging failures break the application
export async function safeAuditLog(entry: AuditLogEntry) {
  try {
    await createAuditLog(entry);
  } catch (error) {
    // Log to error tracking service
    console.error('Audit log failed:', error);
    
    // Could also write to fallback location
    await writeToFallbackLog(entry);
  }
}
```

---

## UI Components

### Audit Log Viewer

**Location**: `components/AuditLogsClient.tsx`

Features:
- Filter by user, resource, action, date range
- Real-time updates
- Export to CSV/PDF
- Detailed view of each log entry
- Search functionality

### Patient Access History

**Location**: Patient detail page

Shows all staff who accessed the patient's records:
- Date/time of access
- Staff member name and role
- Action performed
- Purpose of access

---

## Compliance Requirements

### PH DPA Requirements
- ✅ Log all access to personal data
- ✅ Retain logs for minimum 5 years
- ✅ Provide access logs to data subjects on request
- ✅ Monitor for unauthorized access
- ✅ Report suspicious activity

### Healthcare Regulations
- ✅ Maintain audit trail for all medical records
- ✅ Log prescription access and dispensing
- ✅ Track laboratory result access
- ✅ Document consent and authorization

---

## Resources

- [Audit Logging Best Practices](https://owasp.org/www-community/controls/Audit_Logging)
- [PH DPA Audit Requirements](https://privacy.gov.ph)
- [Healthcare Audit Standards](https://www.doh.gov.ph)

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0
