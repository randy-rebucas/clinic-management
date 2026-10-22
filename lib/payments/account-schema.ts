import { z } from 'zod';
import { PAYMENT_PROVIDERS } from '@/lib/payments/providers';

/**
 * What the payment-account forms send, and what comes back (no secrets). Client-safe.
 */

/** A QR image as a data URL: PNG/JPEG/WebP, small (it is shown on the pay page). */
export const QR_MAX_BYTES = 300 * 1024;
const qrImage = z
  .string()
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Upload a PNG, JPEG or WebP image')
  .refine((v) => (v.length * 3) / 4 <= QR_MAX_BYTES * 1.4, 'The QR image is too large (300 KB at most)');

export const accountInputSchema = z
  .object({
    provider: z.enum(PAYMENT_PROVIDERS),
    label: z.string().trim().min(1, 'Name this account').max(100),
    ownerType: z.enum(['clinic', 'doctor']).default('clinic'),
    doctorId: z.string().trim().optional(),
    isDefault: z.boolean().optional(),
    enabled: z.boolean().optional(),
    /** Online: write-only. Blank on an edit keeps the stored value. */
    secretKey: z.string().trim().max(300).optional(),
    webhookSecret: z.string().trim().max(300).optional(),
    publicKey: z.string().trim().max(200).optional(),
    manual: z
      .object({
        accountName: z.string().trim().max(150).optional(),
        number: z.string().trim().max(60).optional(),
        bankName: z.string().trim().max(100).optional(),
        qrImage: qrImage.optional().or(z.literal('')),
        instructions: z.string().trim().max(500).optional(),
      })
      .optional(),
  })
  .strict();
export type AccountInput = z.infer<typeof accountInputSchema>;

export interface PaymentAccountView {
  id: string;
  ownerType: 'clinic' | 'doctor';
  doctorId: string | null;
  doctorName: string | null;
  provider: (typeof PAYMENT_PROVIDERS)[number];
  label: string;
  isDefault: boolean;
  enabled: boolean;
  online: boolean;
  /** Online: the end of the stored secret key, and whether a webhook secret is stored. */
  secretLast4: string | null;
  webhookSecretSet: boolean;
  publicKey: string | null;
  mode: 'live' | 'test' | null;
  /** Online: the URL to register with the provider. */
  webhookUrl: string | null;
  manual: { accountName: string; number: string; bankName: string; instructions: string; hasQr: boolean } | null;
  verifiedAt: string | null;
  lastWebhookAt: string | null;
}

export const PROVIDER_LABEL: Record<(typeof PAYMENT_PROVIDERS)[number], string> = {
  paymongo: 'PayMongo',
  xendit: 'Xendit',
  maya: 'Maya Business',
  manual_qr: 'GCash / Maya QR',
  bank_transfer: 'Bank transfer',
};
