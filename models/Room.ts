import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRoom extends Document {
  // Multi-tenant support
  tenantId: Types.ObjectId; // Reference to Tenant
  
  name: string; // e.g., "Room 101", "Consultation Room A"
  roomNumber?: string; // Optional numeric identifier
  floor?: number;
  building?: string;
  roomType: 'consultation' | 'examination' | 'procedure' | 'surgery' | 'other';
  capacity?: number; // Maximum number of people
  equipment?: string[]; // List of equipment available
  amenities?: string[]; // List of amenities
  status: 'available' | 'occupied' | 'maintenance' | 'unavailable';
  notes?: string;
  schedule?: {
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    isAvailable: boolean;
  }[];
  availabilityOverrides?: {
    date: Date;
    isAvailable: boolean;
    reason?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema: Schema = new Schema(
  {
    // Multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: [true, 'Tenant is required'],
      index: true,
    },
    
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
    },
    roomNumber: {
      type: String,
      trim: true,
    },
    floor: {
      type: Number,
    },
    building: {
      type: String,
      trim: true,
    },
    roomType: {
      type: String,
      enum: ['consultation', 'examination', 'procedure', 'surgery', 'other'],
      default: 'consultation',
      index: true,
    },
    capacity: {
      type: Number,
      min: 1,
    },
    equipment: [{
      type: String,
      trim: true,
    }],
    amenities: [{
      type: String,
      trim: true,
    }],
    status: {
      type: String,
      enum: ['available', 'occupied', 'maintenance', 'unavailable'],
      default: 'available',
    },
    notes: {
      type: String,
    },
    schedule: [
      {
        dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        isAvailable: { type: Boolean, default: true },
      },
    ],
    availabilityOverrides: [
      {
        date: { type: Date, required: true },
        isAvailable: { type: Boolean, required: true },
        reason: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
RoomSchema.index({ tenantId: 1, name: 1 }, { unique: true }); // Room name unique per tenant
RoomSchema.index({ tenantId: 1 }); // Tenant index
RoomSchema.index({ tenantId: 1, roomType: 1, status: 1 });
RoomSchema.index({ tenantId: 1, status: 1 });

export default mongoose.models.Room || mongoose.model<IRoom>('Room', RoomSchema);

