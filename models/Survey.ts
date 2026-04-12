import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISurveyResponse extends Document {
  tenantId?: Types.ObjectId;
  visitId: Types.ObjectId;
  patientId?: Types.ObjectId;

  // Rating questions (1–5)
  overallRating: number;
  doctorRating?: number;
  staffRating?: number;
  facilityRating?: number;
  waitTimeRating?: number;

  // Open-ended
  comments?: string;
  wouldRecommend?: boolean;

  // Metadata
  submittedAt: Date;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SurveySchema = new Schema<ISurveyResponse>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit', required: true, index: true },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },

    overallRating: { type: Number, required: true, min: 1, max: 5 },
    doctorRating: { type: Number, min: 1, max: 5 },
    staffRating: { type: Number, min: 1, max: 5 },
    facilityRating: { type: Number, min: 1, max: 5 },
    waitTimeRating: { type: Number, min: 1, max: 5 },

    comments: { type: String, maxlength: 2000 },
    wouldRecommend: { type: Boolean },

    submittedAt: { type: Date, default: Date.now },
    ipAddress: { type: String },
  },
  { timestamps: true }
);

// One survey per visit
SurveySchema.index({ visitId: 1 }, { unique: true });
SurveySchema.index({ tenantId: 1, submittedAt: -1 });

export default mongoose.models.Survey || mongoose.model<ISurveyResponse>('Survey', SurveySchema);
