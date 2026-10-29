import mongoose, { Schema, Document, Types } from 'mongoose';

export type AuditAction = 
  | 'create' 
  | 'read' 
  | 'update' 
  | 'delete' 
  | 'login' 
  | 'logout' 
  | 'export' 
  | 'print' 
  | 'download' 
  | 'view' 
  | 'access_denied' 
  | 'password_change' 
  | 'permission_change'
  | 'backup'
  | 'restore'
  | 'data_export'
  | 'data_deletion';

export type AuditResource = 
  | 'patient' 
  | 'visit' 
  | 'appointment' 
  | 'prescription' 
  | 'lab_result' 
  | 'invoice' 
  | 'document' 
  | 'user' 
  | 'doctor' 
  | 'room' 
  | 'service' 
  | 'notification'
  | 'referral'
  | 'membership'
  | 'staff'
  | 'medicine'
  | 'settings'
  | 'system'
  | 'clinical_template'
  | 'hmo'
  | 'hmo_claim'
  | 'philhealth'
  | 'message'
  | 'report'
  | 'inventory';

export interface IAuditLog extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  // User information
  userId?: Types.ObjectId; // User who performed the action; absent for sign-ins with an unknown email
  userEmail?: string; // Cached for quick reference
  userRole?: string; // Cached user role
  
  // Action details
  action: AuditAction;
  resource: AuditResource;
  resourceId?: Types.ObjectId; // ID of the resource accessed/modified
  
  // Request details
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string; // GET, POST, PUT, DELETE
  requestPath?: string; // API endpoint or page path
  
  // Change tracking
  changes?: {
    field: string;
    oldValue?: any;
    newValue?: any;
  }[];
  
  // Additional context
  description?: string; // Human-readable description
  metadata?: { [key: string]: any }; // Additional context data
  
  // Result
  success: boolean;
  errorMessage?: string;
  
  // Compliance
  isSensitive?: boolean; // Mark sensitive data access
  dataSubject?: Types.ObjectId; // Patient ID if accessing patient data (for PH DPA)
  
  // Timestamp
  timestamp: Date;

  /** Only on entries written before Oct 2026, when the schema still had timestamps; use `timestamp`. */
  createdAt?: Date;
}

const ChangeSchema: Schema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const AuditLogSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    
    // Absent only for a sign-in attempt with an email that has no account (userEmail holds what was typed).
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userEmail: { type: String },
    userRole: { type: String },
    action: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'print', 'download', 'view', 'access_denied', 'password_change', 'permission_change', 'backup', 'restore', 'data_export', 'data_deletion'],
      required: true,
    },
    resource: {
      type: String,
      enum: ['patient', 'visit', 'appointment', 'prescription', 'lab_result', 'invoice', 'document', 'user', 'doctor', 'room', 'service', 'notification', 'referral', 'membership', 'staff', 'medicine', 'settings', 'system', 'hmo', 'hmo_claim', 'philhealth', 'clinical_template', 'message', 'report', 'inventory'],
      required: true,
    },
    resourceId: { type: Schema.Types.ObjectId },
    ipAddress: { type: String },
    userAgent: { type: String },
    requestMethod: { type: String },
    requestPath: { type: String },
    changes: [ChangeSchema],
    description: { type: String },
    metadata: { type: Schema.Types.Mixed },
    success: { type: Boolean, required: true, default: true },
    errorMessage: { type: String },
    isSensitive: { type: Boolean, default: false },
    dataSubject: { type: Schema.Types.ObjectId, ref: 'Patient' }, // For PH DPA compliance
    // When it happened. Entries are never edited, so there are no createdAt/updatedAt timestamps.
    timestamp: { type: Date, default: Date.now, required: true },
  },
);

// Every audit entry writes each of these, so keep only what a query uses. Reads are tenant-scoped
// (the log page, insights, retention) except a user's own sign-in history, which goes by userId.
AuditLogSchema.index({ userId: 1, timestamp: -1 }); // Own activity (lib/account.ts); also the log's "by user" filter
AuditLogSchema.index({ tenantId: 1, resource: 1, resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ tenantId: 1, action: 1, timestamp: -1 });
AuditLogSchema.index({ tenantId: 1, dataSubject: 1, timestamp: -1 }); // For PH DPA queries
AuditLogSchema.index({ tenantId: 1, timestamp: -1 }); // Time-based queries, and archiving (lib/audit-archive.ts)

// Old entries move to archive files (lib/audit-archive.ts), so there is no TTL index.

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

