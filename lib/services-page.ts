import 'server-only';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import Service from '@/models/Service';
import Invoice from '@/models/Invoice';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import { getSettings } from '@/lib/settings';
import { USAGE_DAYS, isServiceCategory, type ServiceRow, type ServicesPageData, type TypedCharge } from '@/lib/services';

/** A price list is small; the page loads it whole and filters on the client. */
const MAX_SERVICES = 1000;
const TYPED_SHOWN = 5;

type Session = { userId: string; tenantId?: string; role: string; roleId?: string };

interface LeanService {
  _id: Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  category: string;
  type?: string;
  unitPrice: number;
  unit?: string;
  duration?: number;
  active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Everything /admin/services shows: the whole price list, and, for people who may see billing,
 * how each service was charged on invoices over the last 90 days (refunded invoices left out),
 * the charges typed by hand instead, and how often a closed visit fell back to the fixed fee.
 */
export async function loadServicesPage(session: Session): Promise<ServicesPageData> {
  if (!session.tenantId || !Types.ObjectId.isValid(session.tenantId)) throw new Error('No clinic on this session');
  const tenantId = new Types.ObjectId(session.tenantId);
  await connectDB();

  const check = await getPermissionChecker(session);
  const seeBilling = check('invoices', 'read') || check('reports', 'read');
  const now = new Date();
  const since = new Date(now.getTime() - USAGE_DAYS * 24 * 60 * 60 * 1000);

  const [services, settings, usage] = await Promise.all([
    Service.find({ tenantId })
      .select('code name description category type unitPrice unit duration active notes createdAt updatedAt')
      .sort({ category: 1, name: 1 })
      .limit(MAX_SERVICES + 1)
      .lean<LeanService[]>(),
    getSettings(String(tenantId)),
    seeBilling
      ? Invoice.aggregate<{
          linked: { _id: Types.ObjectId; lines: number; quantity: number; amount: number; last: Date }[];
          typed: { _id: string; label: string; lines: number; prices: number[] }[];
          fallback: { n: number }[];
          total: { n: number }[];
        }>([
          { $match: { tenantId, status: { $ne: 'refunded' }, createdAt: { $gte: since } } },
          { $unwind: '$items' },
          {
            $facet: {
              linked: [
                { $match: { 'items.serviceId': { $ne: null } } },
                {
                  $group: {
                    _id: '$items.serviceId',
                    lines: { $sum: 1 },
                    quantity: { $sum: { $ifNull: ['$items.quantity', 1] } },
                    amount: { $sum: { $ifNull: ['$items.total', 0] } },
                    last: { $max: '$createdAt' },
                  },
                },
              ],
              // The automatic invoice's fixed consultation fee (code CONSULT, no service).
              fallback: [{ $match: { 'items.serviceId': null, 'items.code': 'CONSULT', 'items.category': 'consultation' } }, { $count: 'n' }],
              typed: [
                { $match: { 'items.serviceId': null, 'items.code': { $ne: 'CONSULT' }, 'items.description': { $type: 'string', $ne: '' } } },
                {
                  $group: {
                    _id: { $toLower: { $trim: { input: '$items.description' } } },
                    label: { $first: { $trim: { input: '$items.description' } } },
                    lines: { $sum: 1 },
                    prices: { $push: '$items.unitPrice' },
                  },
                },
                { $sort: { lines: -1, _id: 1 } },
              ],
              total: [{ $count: 'n' }],
            },
          },
        ])
      : Promise.resolve(null),
  ]);

  const truncated = services.length > MAX_SERVICES;
  const list = services.slice(0, MAX_SERVICES);
  const facet = usage?.[0];
  const byService = new Map((facet?.linked ?? []).map((u) => [String(u._id), u]));

  const rows: ServiceRow[] = list.map((s) => {
    const u = byService.get(String(s._id));
    return {
      _id: String(s._id),
      code: s.code,
      name: s.name,
      description: s.description || null,
      category: isServiceCategory(s.category) ? s.category : 'other',
      type: s.type || null,
      unitPrice: s.unitPrice ?? 0,
      unit: s.unit || 'per service',
      duration: typeof s.duration === 'number' && s.duration > 0 ? s.duration : null,
      active: s.active !== false,
      notes: s.notes || null,
      createdAt: new Date(s.createdAt).toISOString(),
      updatedAt: new Date(s.updatedAt).toISOString(),
      usage: u ? { lines: u.lines, quantity: u.quantity, amount: u.amount, lastBilled: new Date(u.last).toISOString() } : null,
    };
  });

  const activeNames = new Map(rows.filter((r) => r.active).map((r) => [r.name.trim().toLowerCase(), r.name]));
  const typedAll = facet?.typed ?? [];
  const typed: TypedCharge[] = typedAll.slice(0, TYPED_SHOWN).map((t) => ({
    label: t.label,
    lines: t.lines,
    typicalPrice: median(t.prices.filter((p) => typeof p === 'number')),
    sameAs: activeNames.get(t._id) ?? null,
  }));

  return {
    rows,
    truncated,
    currency: settings.billingSettings?.currency || 'PHP',
    autoBilling: (settings.automationSettings as { autoInvoiceGeneration?: boolean } | undefined)?.autoInvoiceGeneration !== false,
    usage: facet
      ? {
          since: since.toISOString(),
          totalLines: facet.total[0]?.n ?? 0,
          typedLines: typedAll.reduce((n, t) => n + t.lines, 0),
          typed,
          fallbackLines: facet.fallback[0]?.n ?? 0,
        }
      : null,
    can: { write: check('services', 'write'), remove: check('services', 'delete') },
    now: now.toISOString(),
  };
}
