import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPatientNote extends Document {
  patient: Types.ObjectId;
  author: {
    userId: Types.ObjectId;
    name: string;
    role: string;
  };
  content: string;
  visibility: 'private' | 'internal' | 'shared'; // private: only author, internal: clinic staff, shared: visible to patient
  priority?: 'low' | 'normal' | 'high';
  tags?: string[]; // e.g., ['insurance', 'follow-up', 'urgent']
  attachments?: {
    url: string;
    name: string;
    type: string;
    uploadedAt: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
  tenantId?: Types.ObjectId;
}

const PatientNoteSchema = new Schema<IPatientNote>(
  {
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    author: {
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      role: {
        type: String,
        required: true,
      },
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    visibility: {
      type: String,
      enum: ['private', 'internal', 'shared'],
      default: 'internal',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal',
    },
    tags: {
      type: [String],
      default: [],
    },
    attachments: [
      {
        url: String,
        name: String,
        type: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    tenantId: {
      type: Schema.Types.ObjectId,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
PatientNoteSchema.index({ patient: 1, createdAt: -1 });
PatientNoteSchema.index({ patient: 1, visibility: 1 });
PatientNoteSchema.index({ 'author.userId': 1, createdAt: -1 });

export default mongoose.models.PatientNote || mongoose.model<IPatientNote>('PatientNote', PatientNoteSchema);
