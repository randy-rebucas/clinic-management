import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A pharma or device company's team of medical reps. A rep creates it from the app and becomes
 * its manager; other reps join by accepting the manager's invite (MedicalRepresentative.teamInvite).
 * Members are the reps whose `teamId` points here. A paid team subscription covers up to
 * `subscription.seats` members (lib/rep-billing.ts).
 */
export interface IRepTeam extends Document {
  name: string;
  /** Rep users who see the whole team. The creator is the first. */
  managerUserIds: Types.ObjectId[];
  subscription?: {
    seats: number;
    billingCycle: 'monthly' | 'yearly';
    expiresAt?: Date;
    lastPaymentId?: string;
    paymentHistory?: Array<{ paymentId: string; amount: number; seats: number; billingCycle: 'monthly' | 'yearly'; paidAt: Date }>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const RepTeamSchema = new Schema<IRepTeam>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    managerUserIds: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true, index: true },
    subscription: {
      seats: { type: Number, min: 0, default: 0 },
      billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      expiresAt: Date,
      lastPaymentId: String,
      paymentHistory: [
        {
          paymentId: { type: String, required: true },
          amount: { type: Number, required: true },
          seats: { type: Number, required: true },
          billingCycle: { type: String, enum: ['monthly', 'yearly'], required: true },
          paidAt: { type: Date, default: Date.now },
          _id: false,
        },
      ],
    },
  },
  { timestamps: true }
);

export default (mongoose.models.RepTeam as mongoose.Model<IRepTeam>) || mongoose.model<IRepTeam>('RepTeam', RepTeamSchema);
