import mongoose, { Schema, Document, Types } from 'mongoose';
import { AttachmentSchema, IAttachment } from './Attachment';

export interface IPatient extends Document {
  // Tenant references for multi-tenant support (can belong to multiple clinics)
  tenantIds?: Types.ObjectId[];
  
  // Patient identification
  patientCode?: string; // e.g. CLINIC-0001 (optional for backward compatibility)
  
  // Basic information
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: Date; // Using dateOfBirth for consistency with existing API
  sex: 'male' | 'female' | 'other';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  
  // Contact information
  email?: string;
  phone: string;
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
  emergencyContact?: {
    name?: string;
    phone?: string;
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
    // Tenant references for multi-tenant support (can belong to multiple clinics)
    tenantIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: 'Tenant',
          index: true,
        },
      ],
      required: false,
      default: undefined,
    },
    
    // Patient identification
    patientCode: {
      type: String,
      unique: true, // unique: true automatically creates an index
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
      enum: ['male', 'female', 'other'],
      required: [true, 'Sex is required'],
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
    
    // Contact information
    email: {
      type: String,
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
      street: { type: String, required: [true, 'Street address is required'], trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true },
      state: { type: String, required: [true, 'State is required'], trim: true },
      zipCode: { type: String, required: [true, 'Zip code is required'], trim: true },
    },

    // Emergency contact (merged from both models)
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      relationship: { type: String, trim: true }, // from original Patient
      relation: { type: String, trim: true }, // from Extended (alias)
    },
    
    // Identifiers
    identifiers: {
      philHealth: { type: String, trim: true },
      govId: { type: String, trim: true },
      // sparse indexes are created explicitly below via compound indexes
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

// Indexes (updated for tenantIds array)
PatientSchema.index({ tenantIds: 1, lastName: 1, firstName: 1 }); // Tenant-scoped name queries
PatientSchema.index({ tenantIds: 1, email: 1 }); // Tenant-scoped email (compound index for uniqueness)
PatientSchema.index({ tenantIds: 1, dateOfBirth: 1 }); // Tenant-scoped age queries
PatientSchema.index({ tenantIds: 1, sex: 1 }); // Tenant-scoped gender queries
PatientSchema.index({ tenantIds: 1, active: 1 }); // Tenant-scoped active patient queries
PatientSchema.index({ tenantIds: 1, 'identifiers.philHealth': 1 }); // Tenant-scoped PhilHealth lookups
PatientSchema.index({ tenantIds: 1, 'identifiers.govId': 1 }); // Tenant-scoped government ID lookups
PatientSchema.index({ tenantIds: 1, createdAt: -1 }); // Tenant-scoped registration date queries
PatientSchema.index({ tenantIds: 1, patientCode: 1 }, { unique: true, sparse: true }); // Tenant-scoped patient code

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
