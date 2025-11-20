import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IProcedure extends Document {
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

// Indexes for efficient queries
ProcedureSchema.index({ patient: 1, date: -1 });
ProcedureSchema.index({ visit: 1 });
ProcedureSchema.index({ performedBy: 1 });

export default mongoose.models.Procedure || mongoose.model<IProcedure>('Procedure', ProcedureSchema);

