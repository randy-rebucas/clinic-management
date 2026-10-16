import { Types, Model } from 'mongoose';
import Counter from '@/models/Counter';

/**
 * Atomically allocate the next number in a per-tenant sequence.
 *
 * On first use for a (tenant, key) pair, pass `seed` to start after existing data:
 * it is called once to find the current highest number so codes continue from there.
 */
export async function nextSequence(
  tenantId: string | Types.ObjectId | null | undefined,
  key: string,
  seed?: () => Promise<number>
): Promise<number> {
  const tid = tenantId ? new Types.ObjectId(String(tenantId)) : null;

  const existing = await Counter.findOneAndUpdate(
    { tenantId: tid, key },
    { $inc: { seq: 1 } },
    { new: true }
  ).lean();
  if (existing) return existing.seq;

  const start = seed ? Math.max(0, await seed()) : 0;
  try {
    const created = await Counter.create({ tenantId: tid, key, seq: start + 1 });
    return created.seq;
  } catch (err: any) {
    // Another request created the counter first; just increment it.
    if (err?.code === 11000) {
      const doc = await Counter.findOneAndUpdate({ tenantId: tid, key }, { $inc: { seq: 1 } }, { new: true }).lean();
      if (doc) return doc.seq;
    }
    throw err;
  }
}

/** Format a sequence as e.g. APT-000123 (padding grows naturally past the width). */
export function formatCode(prefix: string, seq: number, width = 6): string {
  return `${prefix}-${String(seq).padStart(width, '0')}`;
}

/**
 * Seed helper: highest numeric suffix among existing codes for a tenant.
 * Sorts numerically (via parsing) rather than as strings.
 */
export function maxCodeSeed(
  model: Model<any>,
  field: string,
  filter: Record<string, unknown>
): () => Promise<number> {
  return async () => {
    const docs = await model.find(filter).select(field).lean();
    let max = 0;
    for (const d of docs as any[]) {
      const m = String(d?.[field] ?? '').match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  };
}
