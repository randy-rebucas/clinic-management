import mongoose, { Schema, Document, Model } from 'mongoose';

export const PLATFORM_SETTING_KEYS = ['billing-issuer', 'paymongo', 'pricing', 'fees'] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

/**
 * Platform → Configuration: one document per section, edited by platform admins in the console
 * (lib/platform-config.ts). `data` holds the section's plain values; `secrets` holds encrypted
 * values (lib/encryption.ts) and is never selected unless asked for.
 */
export interface IPlatformSetting extends Document {
  key: PlatformSettingKey;
  data: Record<string, unknown>;
  secrets?: Record<string, string>;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSettingSchema = new Schema<IPlatformSetting>(
  {
    key: { type: String, enum: PLATFORM_SETTING_KEYS, required: true, unique: true },
    data: { type: Schema.Types.Mixed, default: {} },
    secrets: { type: Schema.Types.Mixed, select: false },
    updatedBy: { type: String },
  },
  { timestamps: true, minimize: false }
);

const PlatformSetting: Model<IPlatformSetting> =
  (mongoose.models.PlatformSetting as Model<IPlatformSetting>) ||
  mongoose.model<IPlatformSetting>('PlatformSetting', PlatformSettingSchema);

export default PlatformSetting;
