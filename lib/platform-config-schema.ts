import { z } from 'zod';
import { BRANCH_CODE, SERIAL_PREFIX } from '@/lib/bir';
import { PAID_PLANS, type PaidPlan } from '@/lib/subscription-period';

/**
 * Platform → Configuration sections: what platform admins edit in the console and the shapes
 * lib/platform-config.ts hands to the rest of the app. Shared with the console's forms, so it
 * holds no secrets and no server code.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/** DevCom Digital as the seller on subscription sales invoices (BIR). */
export const billingIssuerSchema = z
  .object({
    sellerName: trimmed(200).min(2, 'Enter the registered name'),
    tradeName: trimmed(200).default(''),
    /** Nine digits, as on the Certificate of Registration (Form 2303). */
    tin: z.string().trim().regex(/^\d{3}-?\d{3}-?\d{3}$/, 'Enter the 9-digit TIN, e.g. 123-456-789'),
    branchCode: z.string().trim().regex(BRANCH_CODE, 'Branch code is 3 to 5 digits (00000 = head office)'),
    address: trimmed(500).min(5, 'Enter the registered address'),
    vatRegime: z.enum(['vat', 'non_vat']),
    vatRate: z.number().min(0).max(30).default(12),
    permitNumber: trimmed(100).min(1, 'Enter the ATP or permit number'),
    permitIssuedOn: trimmed(40).default(''),
    serialPrefix: z.string().trim().regex(SERIAL_PREFIX, 'Up to 6 letters, digits or dashes'),
    serialStart: z.number().int().min(1),
    serialEnd: z.number().int().min(1),
    footerNote: trimmed(500).default(''),
  })
  .refine((v) => v.serialEnd >= v.serialStart, { message: 'The range must end at or after its start', path: ['serialEnd'] });
export type BillingIssuer = z.infer<typeof billingIssuerSchema>;

/** The platform's own PayMongo account (subscriptions, med-rep fee). Secrets are write-only. */
export const paymongoSectionSchema = z
  .object({
    /** Blank keeps the stored key. */
    secretKey: z.string().trim().regex(/^sk_(test|live)_[A-Za-z0-9]+$/, 'A PayMongo secret key starts with sk_test_ or sk_live_').optional().or(z.literal('')),
    webhookSecret: z.string().trim().regex(/^whsk_[A-Za-z0-9]+$/, 'A PayMongo webhook secret starts with whsk_').optional().or(z.literal('')),
    /** Forget the stored keys and fall back to the server's env values. */
    clear: z.boolean().optional(),
  })
  .strict();

/** What the console shows about the PayMongo account: never the keys themselves. */
export interface PaymongoStatus {
  configured: boolean;
  source: 'console' | 'env' | null;
  mode: 'live' | 'test' | null;
  secretLast4: string | null;
  webhookConfigured: boolean;
}

const peso = z.number().min(0).max(1_000_000);
export const pricingSchema = z
  .object({
    monthly: z.object(Object.fromEntries(PAID_PLANS.map((p) => [p, peso.min(20, 'At least ₱20 (PayMongo minimum)')])) as Record<PaidPlan, z.ZodNumber>),
    /** Months a yearly plan costs: 10 = two months free. */
    yearlyMonths: z.number().int().min(1).max(12),
  })
  .strict();

/** Clinic sponsorship by a medical rep (lib/sponsorship-pricing.ts): monthly price and term discounts. */
const percentOff = z.number().min(0, 'At least 0%').max(50, 'At most 50%');
export const sponsorshipPricingSchema = z
  .object({
    monthly: peso.min(20, 'At least ₱20 (PayMongo minimum)'),
    discounts: z.object({ '3': percentOff, '6': percentOff, '12': percentOff }).strict(),
  })
  .strict();

export const feesSchema = z
  .object({
    /** 0 = reps are activated by hand, no online fee. */
    medrepActivationFee: peso.refine((v) => v === 0 || v >= 20, 'Use 0 (no online fee) or at least ₱20'),
    /** A rep's monthly subscription for booking visits with clinics. 0 = booking is free. */
    medrepMonthlyFee: peso.refine((v) => v === 0 || v >= 20, 'Use 0 (free) or at least ₱20').default(0),
    /** Per rep seat per month on a company team plan. 0 = team plans aren't sold online. */
    medrepSeatMonthlyFee: peso.refine((v) => v === 0 || v >= 20, 'Use 0 (not sold) or at least ₱20').default(0),
    /** A rep's Pro plan per month: booking plus the AI assistant. 0 = Pro isn't sold. */
    medrepProMonthlyFee: peso.refine((v) => v === 0 || v >= 20, 'Use 0 (not sold) or at least ₱20').default(0),
    /** AI actions a month for reps without Pro (a taste of it). 0 = none. */
    repAiFreeActions: z.number().int().min(0).max(1000).default(20),
    /** AI actions a month on Pro (fair use). */
    repAiProActions: z.number().int().min(1).max(10_000).default(300),
    voucherFaceValue: peso,
    voucherWholesalePrice: peso,
  })
  .strict()
  .refine((v) => v.voucherWholesalePrice <= v.voucherFaceValue, { message: 'The clinic’s price can’t be above the patient price', path: ['voucherWholesalePrice'] })
  .refine((v) => v.medrepProMonthlyFee === 0 || v.medrepProMonthlyFee > v.medrepMonthlyFee, { message: 'Pro must cost more than the standard subscription', path: ['medrepProMonthlyFee'] });
export type PlatformFees = z.infer<typeof feesSchema>;
