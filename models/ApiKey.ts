import mongoose, { Schema, Document, Types } from 'mongoose';

export const API_SCOPES = [
  'patients:read',
  'patients:write',
  'appointments:read',
  'appointments:write',
  'doctors:read',
  'invoices:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * A clinic's key for the public REST API (/api/v1). The secret is shown once at creation;
 * only its SHA-256 is stored. `keyId` is the public part of the key, used to look it up.
 */
export interface IApiKey extends Document {
  tenantId: Types.ObjectId;
  name: string;
  keyId: string;
  secretHash: string;
  /** The first characters of the full key, for recognising it in lists. */
  preview: string;
  scopes: ApiScope[];
  createdBy?: Types.ObjectId;
  createdByEmail?: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    keyId: { type: String, required: true, unique: true },
    secretHash: { type: String, required: true, select: false },
    preview: { type: String, required: true },
    scopes: { type: [String], enum: API_SCOPES, default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByEmail: { type: String },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
