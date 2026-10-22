import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Visit from '@/models/Visit';
import Medicine from '@/models/Medicine';
import { requireTenantSession, isTenantSessionError } from '@/lib/api/tenant-session';
import { escapeRegex } from '@/lib/utils';

const FIELDS = ['dosage', 'frequency', 'duration', 'instructions'] as const;
type Field = (typeof FIELDS)[number];
export type MedicineValues = Record<Field, string[]>;

const PER_FIELD = 15;
const RECENT_MEDICATIONS = 3000;

/**
 * GET /api/medications/values?name=Amoxicillin
 * Dose, frequency, duration and instruction wordings this clinic has written before, for the
 * visit form's medicine fields: the catalogue's usual values for `name` first, then what was
 * written for `name`, then what is written most across all medicines.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireTenantSession();
  if (isTenantSessionError(ctx)) return ctx;

  try {
    await connectDB();
    const name = (request.nextUrl.searchParams.get('name') || '').trim().slice(0, 100);
    const nameKey = name.toLowerCase();

    const [rows, medicine] = await Promise.all([
      Visit.aggregate([
        { $match: { tenantId: ctx.tenantObjectId, 'treatmentPlan.medications.0': { $exists: true } } },
        { $sort: { date: -1 } },
        { $limit: 1000 },
        { $unwind: '$treatmentPlan.medications' },
        { $limit: RECENT_MEDICATIONS },
        { $replaceRoot: { newRoot: '$treatmentPlan.medications' } },
        { $project: { _id: 0, name: 1, dosage: 1, frequency: 1, duration: 1, instructions: 1 } },
      ]),
      name
        ? Medicine.findOne({ tenantId: ctx.tenantObjectId, active: true, name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
            .select('standardDosage standardFrequency duration')
            .lean<{ standardDosage?: string; standardFrequency?: string; duration?: string } | null>()
        : null,
    ]);

    const data = {} as MedicineValues;
    for (const field of FIELDS) {
      // Same-medicine uses outrank everything else; ties go to the more frequent wording.
      const scores = new Map<string, { value: string; score: number }>();
      for (const row of rows) {
        const value = typeof row[field] === 'string' ? row[field].trim() : '';
        if (!value) continue;
        const key = value.toLowerCase();
        const weight = nameKey && row.name?.trim().toLowerCase() === nameKey ? 1000 : 1;
        const entry = scores.get(key) ?? { value, score: 0 };
        entry.score += weight;
        scores.set(key, entry);
      }
      const ranked = [...scores.values()].sort((a, b) => b.score - a.score).map((e) => e.value);

      const usual = { dosage: medicine?.standardDosage, frequency: medicine?.standardFrequency, duration: medicine?.duration, instructions: undefined }[field];
      const values = usual ? [usual, ...ranked.filter((v) => v.toLowerCase() !== usual.toLowerCase())] : ranked;
      data[field] = values.slice(0, PER_FIELD);
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching medicine values:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch medicine values' }, { status: 500 });
  }
}
