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
  | 'system';

export interface IAuditLog extends Document {
  // User information
  userId: Types.ObjectId; // User who performed the action
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
  
  createdAt: Date;
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
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userEmail: { type: String, index: true },
    userRole: { type: String, index: true },
    action: {
      type: String,
      enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'export', 'print', 'download', 'view', 'access_denied', 'password_change', 'permission_change', 'backup', 'restore', 'data_export', 'data_deletion'],
      required: true,
      index: true,
    },
    resource: {
      type: String,
      enum: ['patient', 'visit', 'appointment', 'prescription', 'lab_result', 'invoice', 'document', 'user', 'doctor', 'room', 'service', 'notification', 'system'],
      required: true,
      index: true,
    },
    resourceId: { type: Schema.Types.ObjectId, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    requestMethod: { type: String },
    requestPath: { type: String },
    changes: [ChangeSchema],
    description: { type: String },
    metadata: { type: Schema.Types.Mixed },
    success: { type: Boolean, required: true, default: true, index: true },
    errorMessage: { type: String },
    isSensitive: { type: Boolean, default: false, index: true },
    dataSubject: { type: Schema.Types.ObjectId, ref: 'Patient', index: true }, // For PH DPA compliance
    timestamp: { type: Date, default: Date.now, required: true, index: true },
  },
  { timestamps: true }
);

// Indexes for efficient queries
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
AuditLogSchema.index({ dataSubject: 1, timestamp: -1 }); // For PH DPA queries
AuditLogSchema.index({ isSensitive: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 }); // For time-based queries

// TTL index to auto-delete old logs (optional - keep for 7 years for compliance)
// AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 220752000 }); // 7 years

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

