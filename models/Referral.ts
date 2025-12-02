import mongoose, { Schema, Document, Types } from 'mongoose';

export type ReferralStatus = 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled';
export type ReferralType = 'doctor_to_doctor' | 'patient_to_patient' | 'external';

export interface IReferral extends Document {
  // Multi-tenant support
  tenantId: Types.ObjectId; // Reference to Tenant
  
  // Referral identification
  referralCode: string; // Unique referral code
  type: ReferralType;
  
  // Referring party (doctor or patient)
  referringDoctor?: Types.ObjectId; // Doctor making the referral
  referringPatient?: Types.ObjectId; // Patient making the referral
  referringClinic?: string; // External clinic name
  referringContact?: {
    name: string;
    phone?: string;
    email?: string;
  };
  
  // Receiving party
  receivingDoctor?: Types.ObjectId; // Doctor receiving the referral
  receivingClinic?: string; // Clinic receiving the referral
  
  // Patient information
  patient: Types.ObjectId; // Patient being referred
  
  // Referral details
  reason: string; // Reason for referral
  urgency: 'routine' | 'urgent' | 'stat';
  specialty?: string; // Required specialty
  notes?: string; // Additional notes
  
  // Clinical information
  chiefComplaint?: string;
  diagnosis?: string;
  relevantHistory?: string;
  medications?: string[];
  attachments?: Array<{
    filename: string;
    url: string;
    uploadDate: Date;
  }>;
  
  // Status tracking
  status: ReferralStatus;
  referredDate: Date;
  acceptedDate?: Date;
  completedDate?: Date;
  declinedDate?: Date;
  declinedReason?: string;
  
  // Visit/appointment tracking
  visit?: Types.ObjectId; // Visit created from referral
  appointment?: Types.ObjectId; // Appointment created from referral
  
  // Follow-up
  followUpRequired: boolean;
  followUpDate?: Date;
  followUpNotes?: string;
  
  // Feedback
  feedback?: {
    rating?: number; // 1-5
    comments?: string;
    submittedBy: Types.ObjectId;
    submittedAt: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const ReferralSchema: Schema = new Schema(
  {
    // Multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
      index: true,
    },
    
    referralCode: { type: String, index: true },
    type: {
      type: String,
      enum: ['doctor_to_doctor', 'patient_to_patient', 'external'],
      required: true,
      index: true,
    },
    referringDoctor: { type: Schema.Types.ObjectId, ref: 'Doctor', index: true },
    referringPatient: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    referringClinic: { type: String, trim: true },
    referringContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true },
    },
    receivingDoctor: { type: Schema.Types.ObjectId, ref: 'Doctor', index: true },
    receivingClinic: { type: String, trim: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    reason: { type: String, required: true },
    urgency: {
      type: String,
      enum: ['routine', 'urgent', 'stat'],
      default: 'routine',
      index: true,
    },
    specialty: { type: String, trim: true },
    notes: { type: String },
    chiefComplaint: { type: String },
    diagnosis: { type: String },
    relevantHistory: { type: String },
    medications: [{ type: String }],
    attachments: [{
      filename: { type: String, required: true },
      url: { type: String, required: true },
      uploadDate: { type: Date, default: Date.now },
    }],
    status: {
      type: String,
      enum: ['pending', 'accepted', 'completed', 'declined', 'cancelled'],
      default: 'pending',
      index: true,
    },
    referredDate: { type: Date, default: Date.now, required: true },
    acceptedDate: { type: Date },
    completedDate: { type: Date },
    declinedDate: { type: Date },
    declinedReason: { type: String },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', index: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    followUpRequired: { type: Boolean, default: false },
    followUpDate: { type: Date },
    followUpNotes: { type: String },
    feedback: {
      rating: { type: Number, min: 1, max: 5 },
      comments: { type: String },
      submittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      submittedAt: { type: Date },
    },
  },
  { timestamps: true }
);

// Indexes
ReferralSchema.index({ tenantId: 1, referralCode: 1 }, { unique: true }); // Referral code unique per tenant
ReferralSchema.index({ tenantId: 1 }); // Tenant index
ReferralSchema.index({ tenantId: 1, referringDoctor: 1, status: 1 });
ReferralSchema.index({ tenantId: 1, receivingDoctor: 1, status: 1 });
ReferralSchema.index({ tenantId: 1, patient: 1, status: 1 });
ReferralSchema.index({ tenantId: 1, status: 1, referredDate: -1 });
ReferralSchema.index({ tenantId: 1, type: 1, status: 1 });
ReferralSchema.index({ tenantId: 1, 'feedback.submittedBy': 1 });

// Pre-validate hook to clean up referringContact before validation
ReferralSchema.pre('validate', function (this: IReferral, next) {
  // Clean up referringContact if it doesn't have a name
  if (this.referringContact) {
    if (!this.referringContact.name || (typeof this.referringContact.name === 'string' && this.referringContact.name.trim() === '')) {
      this.referringContact = undefined;
    }
  }
  next();
});

// Pre-save hook to generate referral code
ReferralSchema.pre('save', async function (this: IReferral, next) {
  if (!this.referralCode) {
    const count = await mongoose.models.Referral?.countDocuments({ tenantId: this.tenantId }) || 0;
    this.referralCode = `REF-${Date.now()}-${count + 1}`;
  }
  next();
});

export default mongoose.models.Referral || mongoose.model<IReferral>('Referral', ReferralSchema);

