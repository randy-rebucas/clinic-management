import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IProcedure extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  visit?: Types.ObjectId;
  patient: Types.ObjectId;
  type?: string; // e.g. "minor-surgery", "wound-care", "iv-insertion"
  performedBy?: Types.ObjectId;
  date: Date;
  details?: string;
  outcome?: string;
  attachments: IAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

const ProcedureSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    visit: { type: Schema.Types.ObjectId, ref: 'Visit' },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    type: { type: String }, // e.g. "minor-surgery", "wound-care", "iv-insertion"
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
    details: { type: String },
    outcome: { type: String },
    attachments: [AttachmentSchema],
  },
  { timestamps: true }
);

// Indexes for efficient queries (tenant-scoped)
ProcedureSchema.index({ tenantId: 1, patient: 1, date: -1 });
ProcedureSchema.index({ tenantId: 1, visit: 1 });
ProcedureSchema.index({ tenantId: 1, performedBy: 1 });
ProcedureSchema.index({ tenantId: 1, performedBy: 1, date: -1 }); // For performer history
ProcedureSchema.index({ tenantId: 1, type: 1, date: -1 }); // For procedure type queries

export default mongoose.models.Procedure || mongoose.model<IProcedure>('Procedure', ProcedureSchema);

