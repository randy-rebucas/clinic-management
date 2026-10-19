import { Types } from 'mongoose';
import Hmo from '@/models/Hmo';

type InsuranceInput = {
  provider: string;
  hmo?: string;
  [key: string]: unknown;
};

/**
 * The insurance block as stored: a payer picked from the HMO directory must be this clinic's,
 * and lends the claim its name so reports group by the directory's spelling.
 */
export async function resolveInsurance(
  tenantId: string,
  insurance: InsuranceInput | undefined
): Promise<{ ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string }> {
  if (!insurance) return { ok: true, value: undefined };
  if (!insurance.hmo) return { ok: true, value: insurance };
  const hmo = await Hmo.findOne({ _id: new Types.ObjectId(insurance.hmo), tenantId: new Types.ObjectId(tenantId) }).select('name').lean<{ name: string } | null>();
  if (!hmo) return { ok: false, error: 'That HMO isn’t in this clinic’s list.' };
  return { ok: true, value: { ...insurance, provider: hmo.name, hmo: new Types.ObjectId(insurance.hmo) } };
}
