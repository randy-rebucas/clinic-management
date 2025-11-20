import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  collectionName: string;
  documentId: Types.ObjectId;
  action: 'create' | 'update' | 'delete' | 'view' | 'export';
  performedBy?: Types.ObjectId;
  timestamp: Date;
  changes?: any; // optional: {field: {old, new}}
}

const AuditLogSchema: Schema = new Schema({
  collectionName: { type: String, required: true },
  documentId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, enum: ['create', 'update', 'delete', 'view', 'export'], required: true },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  timestamp: { type: Date, default: Date.now },
  changes: { type: Schema.Types.Mixed }, // optional: {field: {old, new}}
});

// Indexes for efficient queries
AuditLogSchema.index({ collectionName: 1, documentId: 1 });
AuditLogSchema.index({ performedBy: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 });

export default mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

