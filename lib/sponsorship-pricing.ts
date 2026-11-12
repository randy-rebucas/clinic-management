/**
 * What a medical rep pays to sponsor a clinic's subscription (lib/clinic-sponsorship.ts).
 * A sponsored clinic gets the Professional plan at its own price, prepaid for 1, 3, 6 or 12
 * months with a discount on the longer terms. Platform admins set the numbers under
 * Platform → Configuration; DEFAULT_SPONSORSHIP_PRICING applies until they do.
 *
 * Pure (no server code) so the clinic and rep screens and the tests share it.
 */

/** The plan a sponsored clinic is put on. */
export const SPONSORED_PLAN = 'professional' as const;

/** Terms a rep can prepay, in months. */
export const SPONSOR_TERMS = [1, 3, 6, 12] as const;
export type SponsorTerm = (typeof SPONSOR_TERMS)[number];

export type SponsorshipPricing = {
  /** Pesos a month before any discount. */
  monthly: number;
  /** Percent off for each prepaid term longer than a month. */
  discounts: { '3': number; '6': number; '12': number };
};

export const DEFAULT_SPONSORSHIP_PRICING: SponsorshipPricing = {
  monthly: 2500,
  discounts: { '3': 5, '6': 10, '12': 15 },
};

export function isSponsorTerm(v: unknown): v is SponsorTerm {
  return typeof v === 'number' && (SPONSOR_TERMS as readonly number[]).includes(v);
}

export interface SponsorshipQuote {
  months: SponsorTerm;
  /** What the rep pays, in whole pesos. */
  amount: number;
  /** The same months at the monthly price. */
  fullPrice: number;
  percentOff: number;
  /** The effective price per month, rounded to the peso. */
  perMonth: number;
  currency: 'PHP';
}

export function sponsorshipPrice(months: SponsorTerm, pricing: SponsorshipPricing = DEFAULT_SPONSORSHIP_PRICING): SponsorshipQuote {
  const percentOff = months === 1 ? 0 : pricing.discounts[String(months) as '3' | '6' | '12'] ?? 0;
  const fullPrice = pricing.monthly * months;
  const amount = Math.round(fullPrice * (1 - percentOff / 100));
  return { months, amount, fullPrice, percentOff, perMonth: Math.round(amount / months), currency: 'PHP' };
}

/** Every term's price, shortest first. */
export function sponsorshipQuotes(pricing: SponsorshipPricing = DEFAULT_SPONSORSHIP_PRICING): SponsorshipQuote[] {
  return SPONSOR_TERMS.map((m) => sponsorshipPrice(m, pricing));
}

export function termLabel(months: number): string {
  return months === 12 ? '1 year' : months === 1 ? '1 month' : `${months} months`;
}
