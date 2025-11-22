import mongoose, { Schema, Document, Types } from 'mongoose';

export type MembershipTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type MembershipStatus = 'active' | 'inactive' | 'expired' | 'suspended';

export interface IMembership extends Document {
  patient: Types.ObjectId; // Reference to Patient
  membershipNumber: string; // Unique membership number
  tier: MembershipTier;
  status: MembershipStatus;
  
  // Points and rewards
  points: number; // Current points balance
  totalPointsEarned: number; // Lifetime points earned
  totalPointsRedeemed: number; // Lifetime points redeemed
  
  // Membership details
  joinDate: Date;
  expiryDate?: Date;
  renewalDate?: Date;
  
  // Benefits
  discountPercentage: number; // Discount percentage based on tier
  benefits: string[]; // List of benefits (e.g., "free_consultation", "priority_booking")
  
  // Referral tracking
  referredBy?: Types.ObjectId; // Patient who referred this member
  referrals: Types.ObjectId[]; // Patients referred by this member
  
  // Transaction history
  transactions: Array<{
    type: 'earn' | 'redeem' | 'expire' | 'adjustment';
    points: number;
    description: string;
    relatedEntity?: {
      type: 'visit' | 'appointment' | 'invoice';
      id: Types.ObjectId;
    };
    createdAt: Date;
  }>;
  
  // Notes
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema: Schema = new Schema(
  {
    type: {
      type: String,
      enum: ['earn', 'redeem', 'expire', 'adjustment'],
      required: true,
    },
    points: { type: Number, required: true },
    description: { type: String, required: true },
    relatedEntity: {
      type: {
        type: String,
        enum: ['visit', 'appointment', 'invoice'],
      },
      id: { type: Schema.Types.ObjectId },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MembershipSchema: Schema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, unique: true, index: true },
    membershipNumber: { type: String, required: true, unique: true },
    tier: {
      type: String,
      enum: ['bronze', 'silver', 'gold', 'platinum'],
      default: 'bronze',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired', 'suspended'],
      default: 'active',
      index: true,
    },
    points: { type: Number, default: 0, min: 0 },
    totalPointsEarned: { type: Number, default: 0, min: 0 },
    totalPointsRedeemed: { type: Number, default: 0, min: 0 },
    joinDate: { type: Date, default: Date.now, required: true },
    expiryDate: { type: Date },
    renewalDate: { type: Date },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    benefits: [{ type: String }],
    referredBy: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    referrals: [{ type: Schema.Types.ObjectId, ref: 'Patient' }],
    transactions: [TransactionSchema],
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes
// membershipNumber is already indexed via unique: true
MembershipSchema.index({ tier: 1, status: 1 });
MembershipSchema.index({ points: -1 });
MembershipSchema.index({ expiryDate: 1 });

// Pre-save hook to generate membership number and set tier benefits
MembershipSchema.pre('save', async function (this: IMembership, next) {
  if (!this.membershipNumber) {
    const count = await mongoose.models.Membership?.countDocuments() || 0;
    this.membershipNumber = `MEM-${Date.now()}-${count + 1}`;
  }

  // Set tier-based benefits
  const tierBenefits: Record<MembershipTier, { discount: number; benefits: string[] }> = {
    bronze: { discount: 5, benefits: ['points_earn'] },
    silver: { discount: 10, benefits: ['points_earn', 'priority_booking'] },
    gold: { discount: 15, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly'] },
    platinum: { discount: 20, benefits: ['points_earn', 'priority_booking', 'free_consultation_monthly', 'discount_on_procedures'] },
  };

  const tierConfig = tierBenefits[this.tier];
  this.discountPercentage = tierConfig.discount;
  this.benefits = tierConfig.benefits;

  next();
});

export default mongoose.models.Membership || mongoose.model<IMembership>('Membership', MembershipSchema);

