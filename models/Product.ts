import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  tenantId?: Types.ObjectId;
  userId: Types.ObjectId; // Medical representative user id
  medicalRepresentativeId?: Types.ObjectId; // Optional direct reference to medical rep profile
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  dosage?: string;
  strength?: string;
  packaging: string;
  /**
   * What one pack holds, in the unit a clinic dispenses ("30 tablets"). Fills in the conversion
   * when a clinic receives a delivery counted in packs; the clinic can correct it.
   */
  packSize?: { count: number; unit: string };
  expiryDate: Date;
  status: 'active' | 'discontinued' | 'inactive';
  specifications: string[];
  /** When the "expires soon" push went out (cleared when the expiry date changes). */
  expiryAlertSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    medicalRepresentativeId: {
      type: Schema.Types.ObjectId,
      ref: 'MedicalRepresentative',
      index: true,
    },
    name: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    manufacturer: { type: String, required: true },
    description: { type: String, required: true },
    dosage: String,
    strength: String,
    packaging: { type: String, required: true },
    packSize: {
      type: new Schema({ count: { type: Number, min: 1 }, unit: { type: String, trim: true } }, { _id: false }),
      default: undefined,
    },
    expiryDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['active', 'discontinued', 'inactive'],
      default: 'active',
      index: true,
    },
    specifications: { type: [String], default: [] },
    expiryAlertSentAt: Date,
  },
  { timestamps: true }
);

// Indexes for efficient querying
ProductSchema.index({ tenantId: 1, userId: 1, status: 1 });
ProductSchema.index({ tenantId: 1, category: 1, status: 1 });
ProductSchema.index({ tenantId: 1, name: 'text', manufacturer: 'text', description: 'text' });

export default mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);
