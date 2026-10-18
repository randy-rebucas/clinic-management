import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Medicine from '@/models/Medicine';
import Prescription from '@/models/Prescription';
import InventoryItem from '@/models/Inventory';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import {
  USAGE_DAYS,
  isMedicineForm,
  isMedicineRoute,
  nameKey,
  type DoseRange,
  type MedicineRow,
  type MedicinesPageData,
  type MedicineStock,
  type StockStatus,
  type WrittenIn,
} from '@/lib/medicines';

/** The list is a few hundred at most; the page loads it whole and filters on the client. */
const MAX_MEDICINES = 2000;
const WRITTEN_IN_SHOWN = 5;
const WORST_FIRST: StockStatus[] = ['out-of-stock', 'expired', 'low-stock', 'in-stock'];

type Session = { userId: string; tenantId?: string; role: string; roleId?: string };

interface LeanMedicine {
  _id: Types.ObjectId;
  name: string;
  genericName?: string;
  brandNames?: string[];
  form: string;
  strength: string;
  route: string;
  category?: string;
  indications?: string[];
  contraindications?: string[];
  sideEffects?: string[];
  dosageRanges?: Partial<DoseRange>[];
  standardDosage?: string;
  standardFrequency?: string;
  duration?: string;
  requiresPrescription?: boolean;
  controlledSubstance?: boolean;
  schedule?: string;
  active?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface LeanStock {
  _id: Types.ObjectId;
  name: string;
  medicineId?: Types.ObjectId | null;
  quantity?: number;
  unit?: string;
  status?: StockStatus;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);

/**
 * Everything /admin/medicines shows: the whole list; for people who may see prescriptions, how
 * often each medicine was prescribed in the last 90 days (cancelled prescriptions left out) and
 * the medicines written in by a name the list doesn't have; for people who may see stock, what
 * is on the shelf for each (items linked to it, or unlinked ones with its name, as dispensing
 * matches them).
 */
export async function loadMedicinesPage(session: Session): Promise<MedicinesPageData> {
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) throw new Error('No clinic on this session');
  const tenantId = new Types.ObjectId(session.tenantId);
  await connectDB();

  const check = await getPermissionChecker(session);
  const seePrescriptions = check('prescriptions', 'read');
  const seeStock = check('inventory', 'read');
  const now = new Date();
  const since = new Date(now.getTime() - USAGE_DAYS * 24 * 60 * 60 * 1000);

  const [medicines, usage, stock] = await Promise.all([
    Medicine.find({ tenantId })
      .select('-tenantId -__v')
      .sort({ name: 1 })
      .limit(MAX_MEDICINES + 1)
      .lean<LeanMedicine[]>(),
    seePrescriptions
      ? Prescription.aggregate<{
          linked: { _id: Types.ObjectId; lines: number; last: Date }[];
          named: { _id: string; name: string; lines: number; last: Date; dose: string | null; frequency: string | null }[];
          lines: { n: number }[];
          prescriptions: { n: number }[];
        }>([
          { $match: { tenantId, issuedAt: { $gte: since }, status: { $ne: 'cancelled' } } },
          { $unwind: '$medications' },
          { $match: { 'medications.name': { $type: 'string', $ne: '' } } },
          {
            $facet: {
              linked: [
                { $match: { 'medications.medicineId': { $ne: null } } },
                { $group: { _id: '$medications.medicineId', lines: { $sum: 1 }, last: { $max: '$issuedAt' } } },
              ],
              named: [
                { $match: { 'medications.medicineId': null } },
                {
                  $group: {
                    _id: { $toLower: { $trim: { input: '$medications.name' } } },
                    name: { $first: { $trim: { input: '$medications.name' } } },
                    lines: { $sum: 1 },
                    last: { $max: '$issuedAt' },
                    dose: { $first: '$medications.dose' },
                    frequency: { $first: '$medications.frequency' },
                  },
                },
                { $sort: { lines: -1, _id: 1 } },
              ],
              lines: [{ $count: 'n' }],
              prescriptions: [{ $group: { _id: '$_id' } }, { $count: 'n' }],
            },
          },
        ])
      : Promise.resolve(null),
    seeStock
      ? InventoryItem.find({ tenantId, category: 'medicine' }).select('name medicineId quantity unit status').limit(5000).lean<LeanStock[]>()
      : Promise.resolve(null),
  ]);

  const truncated = medicines.length > MAX_MEDICINES;
  const list = medicines.slice(0, MAX_MEDICINES);
  const facet = usage?.[0];

  // Prescriptions: linked lines by id; lines written by name count for the medicine of that name.
  const byId = new Map((facet?.linked ?? []).map((u) => [String(u._id), u]));
  const byName = new Map((facet?.named ?? []).map((u) => [nameKey(u._id), u]));

  // Stock: items linked to a medicine, and unlinked ones matched by name.
  const stockFor = new Map<string, LeanStock[]>();
  const idByName = new Map(list.map((m) => [nameKey(m.name), String(m._id)]));
  for (const item of stock ?? []) {
    const owner = item.medicineId ? String(item.medicineId) : idByName.get(nameKey(item.name));
    if (!owner) continue;
    stockFor.set(owner, [...(stockFor.get(owner) ?? []), item]);
  }

  const rows: MedicineRow[] = list.map((m) => {
    const id = String(m._id);
    const linked = byId.get(id);
    const named = byName.get(nameKey(m.name));
    const lines = (linked?.lines ?? 0) + (named?.lines ?? 0);
    const lastDate = [linked?.last, named?.last].filter(Boolean).map((d) => new Date(d as Date).getTime());
    const items = stockFor.get(id) ?? [];
    const stockRow: MedicineStock | null = items.length
      ? {
          items: items.length,
          quantity: items.reduce((s, i) => s + (i.quantity ?? 0), 0),
          unit: items[0].unit || 'pieces',
          status: WORST_FIRST.find((s) => items.some((i) => (i.status ?? 'in-stock') === s)) ?? 'in-stock',
          itemId: items.length === 1 ? String(items[0]._id) : null,
        }
      : null;

    return {
      _id: id,
      name: m.name,
      genericName: m.genericName?.trim() || null,
      brandNames: strings(m.brandNames),
      form: isMedicineForm(m.form) ? m.form : 'other',
      strength: m.strength ?? '',
      route: isMedicineRoute(m.route) ? m.route : 'other',
      category: m.category?.trim() || 'Other',
      indications: strings(m.indications),
      contraindications: strings(m.contraindications),
      sideEffects: strings(m.sideEffects),
      dosageRanges: (m.dosageRanges ?? [])
        .filter((r) => r && typeof r.dose === 'string' && typeof r.frequency === 'string')
        .map((r) => ({
          minAge: num(r.minAge),
          maxAge: num(r.maxAge),
          minWeight: num(r.minWeight),
          maxWeight: num(r.maxWeight),
          dose: r.dose as string,
          frequency: r.frequency as string,
          maxDailyDose: r.maxDailyDose || null,
        })),
      standardDosage: m.standardDosage?.trim() || null,
      standardFrequency: m.standardFrequency?.trim() || null,
      duration: m.duration?.trim() || null,
      requiresPrescription: m.requiresPrescription !== false,
      controlledSubstance: m.controlledSubstance === true,
      schedule: m.schedule?.trim() || null,
      active: m.active !== false,
      createdAt: new Date(m.createdAt).toISOString(),
      updatedAt: new Date(m.updatedAt).toISOString(),
      usage: lines > 0 ? { lines, last: new Date(Math.max(...lastDate)).toISOString() } : null,
      stock: stockRow,
    };
  });

  // Written in: names that match nothing on file (name, generic name or brand), on or off the list.
  const known = new Set<string>();
  for (const r of rows) {
    known.add(nameKey(r.name));
    if (r.genericName) known.add(nameKey(r.genericName));
    for (const b of r.brandNames) known.add(nameKey(b));
  }
  const writtenAll = (facet?.named ?? []).filter((u) => !known.has(nameKey(u._id)));
  const writtenIn: WrittenIn[] = writtenAll.slice(0, WRITTEN_IN_SHOWN).map((u) => ({
    name: u.name,
    lines: u.lines,
    last: new Date(u.last).toISOString(),
    dose: u.dose?.trim() || null,
    frequency: u.frequency?.trim() || null,
  }));

  return {
    rows,
    truncated,
    usage: facet
      ? {
          since: since.toISOString(),
          totalLines: facet.lines[0]?.n ?? 0,
          prescriptions: facet.prescriptions[0]?.n ?? 0,
          writtenInLines: writtenAll.reduce((n, u) => n + u.lines, 0),
          writtenIn,
        }
      : null,
    stockVisible: stock !== null,
    can: { write: check('medicines', 'write') },
    now: now.toISOString(),
  };
}
