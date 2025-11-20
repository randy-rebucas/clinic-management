import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAppointment extends Document {
  // Patient reference (required)
  patient: Types.ObjectId;
  
  // Provider/Doctor reference (support both for backward compatibility)
  doctor?: Types.ObjectId; // from original Appointment (ref: 'Doctor')
  provider?: Types.ObjectId; // from Extended (ref: 'User')
  
  // Appointment identification
  appointmentCode?: string; // from Extended (optional for backward compatibility)
  
  // Scheduling - support both formats
  appointmentDate?: Date; // from original Appointment
  appointmentTime?: string; // HH:mm format from original Appointment
  scheduledAt?: Date; // from Extended (single datetime field)
  duration?: number; // in minutes, from original Appointment (15-240, default 30)
  
  // Status (merged enums from both models)
  status: 'pending' | 'scheduled' | 'confirmed' | 'rescheduled' | 'no-show' | 'completed' | 'cancelled';
  
  // Walk-in queue support
  isWalkIn?: boolean;
  queueNumber?: number;
  estimatedWaitTime?: number; // in minutes
  
  // Details
  reason?: string; // optional (was required in original, optional in Extended)
  notes?: string;
  
  // Audit
  createdBy?: Types.ObjectId; // from Extended (ref: 'User')
  
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema: Schema = new Schema(
  {
    // Patient reference (required)
    patient: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient is required'],
      index: true,
    },
    
    // Provider/Doctor reference (support both)
    doctor: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      // Not required - can use either doctor or provider
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      // Not required - can use either doctor or provider
    },
    
    // Appointment identification
    appointmentCode: {
      type: String,
      index: true,
      unique: true,
      sparse: true, // Allow null/undefined values
      trim: true,
    },
    
    // Scheduling - support both formats
    appointmentDate: {
      type: Date,
      // Not required - can use scheduledAt instead
    },
    appointmentTime: {
      type: String,
      // Not required - can use scheduledAt instead
      trim: true,
    },
    scheduledAt: {
      type: Date,
      // Not required - can use appointmentDate + appointmentTime instead
      index: true,
    },
    duration: {
      type: Number,
      default: 30, // default 30 minutes
      min: 15,
      max: 240,
    },
    
    // Status (merged enums)
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'confirmed', 'rescheduled', 'no-show', 'completed', 'cancelled'],
      default: 'scheduled',
    },
    
    // Walk-in queue support
    isWalkIn: {
      type: Boolean,
      default: false,
    },
    queueNumber: {
      type: Number,
      index: true,
    },
    estimatedWaitTime: {
      type: Number, // in minutes
    },
    
    // Details
    reason: {
      type: String,
      trim: true,
      // Optional - was required in original, but making optional for flexibility
    },
    notes: {
      type: String,
      default: '',
    },
    
    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
AppointmentSchema.index({ appointmentDate: 1, appointmentTime: 1 });
AppointmentSchema.index({ scheduledAt: 1 });
AppointmentSchema.index({ doctor: 1, appointmentDate: 1 });
AppointmentSchema.index({ provider: 1, scheduledAt: 1 });
AppointmentSchema.index({ patient: 1, status: 1 });
AppointmentSchema.index({ status: 1 });

// Virtual for computed scheduledAt from appointmentDate + appointmentTime
AppointmentSchema.virtual('computedScheduledAt').get(function (this: IAppointment) {
  if (this.scheduledAt) {
    return this.scheduledAt;
  }
  if (this.appointmentDate && this.appointmentTime) {
    const [hours, minutes] = this.appointmentTime.split(':').map(Number);
    const scheduled = new Date(this.appointmentDate);
    scheduled.setHours(hours, minutes, 0, 0);
    return scheduled;
  }
  return undefined;
});

// Virtual for computed appointmentDate/appointmentTime from scheduledAt
AppointmentSchema.virtual('computedDate').get(function (this: IAppointment) {
  if (this.appointmentDate) {
    return this.appointmentDate;
  }
  if (this.scheduledAt) {
    const date = new Date(this.scheduledAt);
    date.setHours(0, 0, 0, 0);
    return date;
  }
  return undefined;
});

AppointmentSchema.virtual('computedTime').get(function (this: IAppointment) {
  if (this.appointmentTime) {
    return this.appointmentTime;
  }
  if (this.scheduledAt) {
    const hours = this.scheduledAt.getHours().toString().padStart(2, '0');
    const minutes = this.scheduledAt.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
  return undefined;
});

// Pre-save hook to ensure at least one scheduling format is provided
AppointmentSchema.pre('save', function (next) {
  const hasDateTime = this.appointmentDate && this.appointmentTime;
  const hasScheduledAt = this.scheduledAt;
  
  if (!hasDateTime && !hasScheduledAt) {
    return next(new Error('Either (appointmentDate + appointmentTime) or scheduledAt must be provided'));
  }
  
  // Ensure at least one provider reference
  if (!this.doctor && !this.provider) {
    return next(new Error('Either doctor or provider must be provided'));
  }
  
  next();
});

// Ensure virtuals are included in JSON output
AppointmentSchema.set('toJSON', { virtuals: true });
AppointmentSchema.set('toObject', { virtuals: true });

export default mongoose.models.Appointment || mongoose.model<IAppointment>('Appointment', AppointmentSchema);
