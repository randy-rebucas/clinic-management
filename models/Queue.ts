import mongoose, { Schema, Document, Types } from 'mongoose';

export type QueueStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
export type QueueType = 'appointment' | 'walk-in' | 'follow-up';

export interface IQueue extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
  // Queue identification
  queueNumber: string; // Display number (e.g., "A001", "W005")
  queueType: QueueType;
  
  // Patient information
  patient: Types.ObjectId; // Reference to Patient
  patientName: string; // Cached for quick display
  
  // Appointment/Visit information
  appointment?: Types.ObjectId; // If from appointment
  visit?: Types.ObjectId; // If from visit
  
  // Doctor and room
  doctor?: Types.ObjectId; // Assigned doctor
  room?: Types.ObjectId; // Assigned room
  
  // Queue management
  status: QueueStatus;
  priority: number; // Lower number = higher priority
  estimatedWaitTime?: number; // Minutes
  
  // Timestamps
  queuedAt: Date; // When added to queue
  calledAt?: Date; // When called to see doctor
  startedAt?: Date; // When consultation started
  completedAt?: Date; // When consultation completed
  
  // Check-in
  checkedIn: boolean;
  checkedInAt?: Date;
  checkInMethod?: 'manual' | 'qr_code' | 'kiosk';
  qrCode?: string; // QR code data for check-in
  
  // Consultation tracking
  consultationDuration?: number; // Minutes (calculated from startedAt to completedAt)
  completionNotes?: string; // Notes when completing consultation
  nextAction?: 'billing' | 'pharmacy' | 'lab' | 'checkout'; // What happens after consultation
  
  // Vital signs (captured before visit creation)
  vitals?: {
    bp?: string;           // Blood pressure (e.g., "120/80")
    hr?: number;           // Heart rate (bpm)
    rr?: number;           // Respiratory rate (breaths/min)
    tempC?: number;        // Temperature in Celsius
    spo2?: number;         // Oxygen saturation (%)
    heightCm?: number;     // Height in cm
    weightKg?: number;     // Weight in kg
    bmi?: number;          // Body Mass Index
  };
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const QueueSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true,
    },
    
    queueNumber: { type: String }, // Auto-generated in pre-validate hook, indexed via compound index below
    queueType: {
      type: String,
      enum: ['appointment', 'walk-in', 'follow-up'],
      required: true,
      index: true,
    },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    patientName: { type: String, required: true },
    appointment: { type: Schema.Types.ObjectId, ref: 'Appointment', index: true },
    visit: { type: Schema.Types.ObjectId, ref: 'Visit', index: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', index: true },
    room: { type: Schema.Types.ObjectId, ref: 'Room', index: true },
    status: {
      type: String,
      enum: ['waiting', 'in-progress', 'completed', 'cancelled', 'no-show'],
      default: 'waiting',
    },
    priority: { type: Number, default: 0, index: true }, // Lower = higher priority
    estimatedWaitTime: { type: Number }, // Minutes
    queuedAt: { type: Date, default: Date.now, required: true, index: true },
    calledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    checkedIn: { type: Boolean, default: false, index: true },
    checkedInAt: { type: Date },
    checkInMethod: {
      type: String,
      enum: ['manual', 'qr_code', 'kiosk'],
    },
    qrCode: { type: String },
    consultationDuration: { type: Number }, // Minutes
    completionNotes: { type: String },
    nextAction: {
      type: String,
      enum: ['billing', 'pharmacy', 'lab', 'checkout'],
    },
    vitals: { type: Schema.Types.Mixed },
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes for efficient queue queries (tenant-scoped)
QueueSchema.index({ tenantId: 1, status: 1, priority: 1, queuedAt: 1 }); // For queue display
QueueSchema.index({ tenantId: 1, doctor: 1, status: 1, priority: 1 });
QueueSchema.index({ tenantId: 1, room: 1, status: 1 });
QueueSchema.index({ tenantId: 1, checkedIn: 1, status: 1 });
QueueSchema.index({ tenantId: 1, qrCode: 1 });
QueueSchema.index({ tenantId: 1, queueNumber: 1 }, { unique: true, sparse: true }); // Tenant-scoped queue number

// Pre-validate hook to generate queue number (runs before validation)
QueueSchema.pre('validate', async function (next) {
  if (!this.queueNumber) {
    const prefix = this.queueType === 'appointment' ? 'A' : this.queueType === 'walk-in' ? 'W' : 'F';
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Count today's queues of this type
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));
    const count = await mongoose.models.Queue?.countDocuments({
      queueType: this.queueType,
      queuedAt: { $gte: startOfDay, $lte: endOfDay },
    }) || 0;
    
    this.queueNumber = `${prefix}${dateStr}-${String(count + 1).padStart(3, '0')}`;
  }
  next();
});

// Pre-save hook to calculate consultation duration
QueueSchema.pre('save', function (next) {
  if (this.status === 'completed' && this.startedAt && this.completedAt) {
    // Type assertion for Date fields in hook context
    const startTime = new Date(this.startedAt as Date);
    const endTime = new Date(this.completedAt as Date);
    const durationMs = endTime.getTime() - startTime.getTime();
    this.consultationDuration = Math.round(durationMs / (1000 * 60)); // Convert to minutes
  }
  next();
});

export default mongoose.models.Queue || mongoose.model<IQueue>('Queue', QueueSchema);

