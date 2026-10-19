import { z } from 'zod';
import { Types } from 'mongoose';
import PhilhealthCaseRate from '@/models/PhilhealthCaseRate';
import { zObjectId, zShortText } from '@/lib/api/validate';
import { isPin, formatPin, philhealthBenefit } from '@/lib/philhealth';
import { roundMoney } from '@/lib/invoice-totals';

export const invoicePhilhealthSchema = z.object({
  pin: z.string().trim().refine(isPin, 'A PhilHealth number has 12 digits.'),
  relationship: z.enum(['member', 'dependent']).default('member'),
  memberName: zShortText.optional(),
  caseRate: zObjectId,
  servedOn: z.coerce.date(),
});
export type InvoicePhilhealthInput = z.infer<typeof invoicePhilhealthSchema>;

/**
 * The PhilHealth claim as stored, priced from the clinic's case rate against this bill's charges:
 * the facility share up to the services, the professional-fee share up to the doctor's fee.
 */
export async function resolvePhilhealth(
  tenantId: string,
  input: InvoicePhilhealthInput,
  bill: { services: number; professionalFee: number }
): Promise<{ ok: true; value: Record<string, unknown>; benefit: number } | { ok: false; error: string }> {
  const rate = await PhilhealthCaseRate.findOne({ _id: new Types.ObjectId(input.caseRate), tenantId: new Types.ObjectId(tenantId), active: true })
    .select('code description amount hciShare pfShare')
    .lean<{ _id: Types.ObjectId; code: string; description: string; amount: number; hciShare: number; pfShare: number } | null>();
  if (!rate) return { ok: false, error: 'That case rate isn’t on the clinic’s PhilHealth list.' };
  const b = philhealthBenefit(rate, bill);
  return {
    ok: true,
    benefit: b.total,
    value: {
      pin: formatPin(input.pin),
      relationship: input.relationship,
      memberName: input.memberName,
      caseRate: rate._id,
      caseRateCode: rate.code,
      caseRateDescription: rate.description,
      hciAmount: b.hciAmount,
      pfAmount: b.pfAmount,
      amount: b.total,
      servedOn: input.servedOn,
      status: 'draft',
    },
  };
}

/** Never claim more from PhilHealth than the bill comes to after discounts. */
export function capBenefit(value: Record<string, unknown>, total: number) {
  const amount = Number(value.amount) || 0;
  if (amount <= total) return value;
  const scale = total > 0 ? total / amount : 0;
  const hci = roundMoney((Number(value.hciAmount) || 0) * scale);
  return { ...value, amount: roundMoney(total), hciAmount: hci, pfAmount: roundMoney(total - hci) };
}

export const grossOf = (items: { quantity: number; unitPrice: number }[], professionalFee?: number) => ({
  services: roundMoney(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)),
  professionalFee: roundMoney(professionalFee ?? 0),
});
