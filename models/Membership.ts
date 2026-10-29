import mongoose, { Schema, Document, Types } from 'mongoose';
import { nextSequence, formatCode, maxCodeSeed } from '@/lib/counters';
import { TIER, type MembershipTier, type MembershipStatus } from '@/lib/memberships';

export type { MembershipTier, MembershipStatus };

export interface IMembership extends Document {
  // Tenant reference for multi-tenant support
  tenantId?: Types.ObjectId;
  
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
  expiryRemindersSent?: number[]; // day thresholds already reminded
  expiryRemindersFor?: Date; // expiryDate the markers apply to

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
    performedBy?: Types.ObjectId; // Staff user who recorded it
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
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MembershipSchema: Schema = new Schema(
  {
    // Tenant reference for multi-tenant support
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
    },
    
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    membershipNumber: { type: String, required: true },
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
    expiryRemindersSent: { type: [Number], default: undefined },
    expiryRemindersFor: { type: Date },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    benefits: [{ type: String }],
    referredBy: { type: Schema.Types.ObjectId, ref: 'Patient', index: true },
    referrals: [{ type: Schema.Types.ObjectId, ref: 'Patient' }],
    transactions: [TransactionSchema],
    notes: { type: String },
  },
  { timestamps: true }
);

// Indexes (tenant-scoped)
MembershipSchema.index({ tenantId: 1, patient: 1 }, { unique: true, sparse: true }); // One membership per patient per tenant
MembershipSchema.index(
  { tenantId: 1, membershipNumber: 1 },
  { unique: true, partialFilterExpression: { membershipNumber: { $type: 'string' } } }
);
MembershipSchema.index({ tenantId: 1, tier: 1, status: 1 });
MembershipSchema.index({ tenantId: 1, points: -1 });
MembershipSchema.index({ tenantId: 1, expiryDate: 1 });

// Must run before validation: membershipNumber is required.
MembershipSchema.pre('validate', async function (this: IMembership, next) {
  if (this.membershipNumber) return next();
  try {
    const seq = await nextSequence(
      this.tenantId,
      'membership',
      maxCodeSeed(mongoose.model('Membership'), 'membershipNumber', {
        tenantId: this.tenantId ?? null,
        membershipNumber: { $regex: /^MEM-\d+$/ },
      })
    );
    this.membershipNumber = formatCode('MEM', seq);
    next();
  } catch (err) {
    next(err as Error);
  }
});

// Set tier benefits
MembershipSchema.pre('save', async function (this: IMembership, next) {

  // Set tier-based benefits (the table lives in lib/memberships so pages show the same terms)
  const tierConfig = TIER[this.tier];
  this.discountPercentage = tierConfig.discount;
  this.benefits = [...tierConfig.benefits];

  next();
});

export default mongoose.models.Membership || mongoose.model<IMembership>('Membership', MembershipSchema);

