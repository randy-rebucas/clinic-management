import mongoose, { Schema, Document, Types } from 'mongoose';

export type QueueStatus = 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
export type QueueType = 'appointment' | 'walk-in' | 'follow-up';

export interface IQueue extends Document {
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
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const QueueSchema: Schema = new Schema(
  {
    queueNumber: { type: String, required: true, unique: true, index: true },
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
      index: true,
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
    qrCode: { type: String, index: true },
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes for efficient queue queries
QueueSchema.index({ status: 1, priority: 1, queuedAt: 1 }); // For queue display
QueueSchema.index({ doctor: 1, status: 1, priority: 1 });
QueueSchema.index({ room: 1, status: 1 });
QueueSchema.index({ checkedIn: 1, status: 1 });
QueueSchema.index({ qrCode: 1 });

// Pre-save hook to generate queue number
QueueSchema.pre('save', async function (next) {
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

export default mongoose.models.Queue || mongoose.model<IQueue>('Queue', QueueSchema);

