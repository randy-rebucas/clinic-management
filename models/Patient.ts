import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IPatient extends Document {
  // Patient identification
  patientCode?: string; // e.g. CLINIC-0001 (optional for backward compatibility)
  
  // Basic information
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: Date; // Using dateOfBirth for consistency with existing API
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  
  // Contact information
  email: string; // Keep required for backward compatibility
  phone: string; // Keep required for backward compatibility
  // Also support contacts object for extended use
  contacts?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  
  // Address (structured from original Patient model)
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  
  // Emergency contact (merged from both models)
  emergencyContact: {
    name: string;
    phone: string;
    relationship?: string; // from original Patient
    relation?: string; // from Extended (alias)
  };
  
  // Identifiers
  identifiers?: {
    philHealth?: string;
    govId?: string;
    other?: Map<string, string>;
  };
  
  // Medical information
  medicalHistory?: string; // from original Patient
  preExistingConditions?: Array<{
    condition: string;
    diagnosisDate?: Date;
    status: 'active' | 'resolved' | 'chronic';
    notes?: string;
  }>; // Pre-existing conditions
  allergies?: Array<string | {
    substance: string;
    reaction: string;
    severity: string;
  }>; // Support both simple strings and structured objects
  
  // Extended medical information
  immunizations?: Array<{
    name: string;
    date: Date;
    batch?: string;
    notes?: string;
  }>;
  
  socialHistory?: {
    smoker?: 'never' | 'former' | 'current' | 'unknown';
    alcohol?: 'none' | 'social' | 'regular' | 'unknown';
    drugs?: 'none' | 'occasional' | 'regular' | 'unknown';
    notes?: string;
  };
  
  familyHistory?: Map<string, string>; // e.g. { diabetes: 'father', cancer: 'mother' }
  
  // Billing & Discount Eligibility
  discountEligibility?: {
    pwd?: {
      eligible: boolean;
      idNumber?: string;
      expiryDate?: Date;
    };
    senior?: {
      eligible: boolean;
      idNumber?: string;
    };
    membership?: {
      eligible: boolean;
      membershipType?: string;
      membershipNumber?: string;
      expiryDate?: Date;
      discountPercentage?: number;
    };
  };
  
  // Status and attachments
  active?: boolean;
  attachments?: IAttachment[];
  
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema: Schema = new Schema(
  {
    // Patient identification
    patientCode: {
      type: String,
      index: true,
      unique: true,
      sparse: true, // Allow null/undefined values
      trim: true,
    },
    
    // Basic information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    middleName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    suffix: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    sex: {
      type: String,
      enum: ['male', 'female', 'other', 'unknown'],
      default: 'unknown',
    },
    civilStatus: {
      type: String,
      trim: true,
    },
    nationality: {
      type: String,
      trim: true,
    },
    occupation: {
      type: String,
      trim: true,
    },
    
    // Contact information (keep required for backward compatibility)
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    // Extended contacts object (optional)
    contacts: {
      phone: { type: String, trim: true },
      email: { type: String, lowercase: true, trim: true },
      address: { type: String, trim: true },
    },
    
    // Address (structured from original Patient model)
    address: {
      street: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      zipCode: { type: String, required: true, trim: true },
    },
    
    // Emergency contact (merged from both models)
    emergencyContact: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      relationship: { type: String, trim: true }, // from original Patient
      relation: { type: String, trim: true }, // from Extended (alias)
    },
    
    // Identifiers
    identifiers: {
      philHealth: { type: String, index: true, sparse: true, trim: true },
      govId: { type: String, index: true, sparse: true, trim: true },
      other: { type: Map, of: String },
    },
    
    // Medical information
    medicalHistory: {
      type: String,
      default: '',
    },
    // Pre-existing conditions
    preExistingConditions: [
      {
        condition: { type: String, required: true },
        diagnosisDate: { type: Date },
        status: {
          type: String,
          enum: ['active', 'resolved', 'chronic'],
          default: 'active',
        },
        notes: { type: String },
      },
    ],
    // Support both simple string array and structured objects
    allergies: [
      {
        type: Schema.Types.Mixed, // Allows both String and Object
      },
    ],
    
    // Extended medical information
    immunizations: [
      {
        name: { type: String, required: true },
        date: { type: Date, required: true },
        batch: { type: String },
        notes: { type: String },
      },
    ],
    
    socialHistory: {
      smoker: {
        type: String,
        enum: ['never', 'former', 'current', 'unknown'],
        default: 'unknown',
      },
      alcohol: {
        type: String,
        enum: ['none', 'social', 'regular', 'unknown'],
        default: 'unknown',
      },
      drugs: {
        type: String,
        enum: ['none', 'occasional', 'regular', 'unknown'],
        default: 'unknown',
      },
      notes: { type: String },
    },
    
    familyHistory: {
      type: Map,
      of: String,
    },
    // Billing & Discount Eligibility
    discountEligibility: {
      pwd: {
        eligible: Boolean,
        idNumber: String,
        expiryDate: Date,
      },
      senior: {
        eligible: Boolean,
        idNumber: String,
      },
      membership: {
        eligible: Boolean,
        membershipType: String,
        membershipNumber: String,
        expiryDate: Date,
        discountPercentage: Number,
      },
    },
    // Status and attachments
    active: {
      type: Boolean,
      default: true,
    },
    attachments: [AttachmentSchema],
  },
  {
    timestamps: true,
  }
);

// Indexes
PatientSchema.index({ lastName: 1, firstName: 1 });
PatientSchema.index({ dateOfBirth: 1 }); // For age-based queries
PatientSchema.index({ sex: 1 }); // For gender-based queries
PatientSchema.index({ active: 1 }); // For active patient queries
PatientSchema.index({ 'identifiers.philHealth': 1 }); // For PhilHealth lookups
PatientSchema.index({ 'identifiers.govId': 1 }); // For government ID lookups
PatientSchema.index({ createdAt: -1 }); // For registration date queries
// email is already indexed via unique: true
// patientCode is already indexed via index: true and unique: true

// Virtual for full name
PatientSchema.virtual('fullName').get(function (this: IPatient) {
  const parts = [this.firstName];
  if (this.middleName) parts.push(this.middleName);
  parts.push(this.lastName);
  if (this.suffix) parts.push(this.suffix);
  return parts.join(' ');
});

// Ensure virtuals are included in JSON output
PatientSchema.set('toJSON', { virtuals: true });
PatientSchema.set('toObject', { virtuals: true });

export default mongoose.models.Patient || mongoose.model<IPatient>('Patient', PatientSchema);
