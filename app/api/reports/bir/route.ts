import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Invoice from '@/models/Invoice';
import { openReport } from '../_lib/report-range';

const MAX_ROWS = 5000;

interface Row {
  _id: string;
  serialNo: string;
  issuedAt: string;
  invoiceNumber: string;
  status: string;
  total: number;
  taxBreakdown?: {
    grossSales?: number;
    vatableSales?: number;
    vatAmount?: number;
    vatExemptSales?: number;
    zeroRatedSales?: number;
    statutoryDiscount?: number;
  };
  discounts?: { type: string; amount?: number; idNumber?: string }[];
  patient?: { firstName?: string; lastName?: string };
}

/**
 * GET /api/reports/bir?period=|startDate=&endDate=
 * The BIR books for sales invoices issued in the window, by issue date: a day-by-day sales
 * summary (gross, VATable, VAT, VAT-exempt, zero-rated, discounts, net) and the senior citizen
 * and PWD sales book (name, ID number, serial, gross, VAT-exempt sale, discount, net). Refunded
 * invoices stay listed, marked cancelled, and count in no total, so the serials have no gaps.
 */
export async function GET(request: NextRequest) {
  const open = await openReport(request.nextUrl.searchParams, 'bir');
  if (open instanceof NextResponse) return open;
  const { tenantObjectId, tz, start, end } = open;

  try {
    await connectDB();
    const rows = await Invoice.aggregate<Row>([
      { $match: { tenantId: tenantObjectId, 'bir.serialNo': { $type: 'string' }, 'bir.issuedAt': { $gte: start, $lte: end } } },
      { $sort: { 'bir.issuedAt': 1, _id: 1 } },
      { $limit: MAX_ROWS + 1 },
      { $lookup: { from: 'patients', localField: 'patient', foreignField: '_id', as: 'p', pipeline: [{ $match: { tenantIds: tenantObjectId } }, { $project: { firstName: 1, lastName: 1 } }] } },
      {
        $project: {
          serialNo: '$bir.serialNo',
          issuedAt: { $dateToString: { format: '%Y-%m-%d', date: '$bir.issuedAt', timezone: tz } },
          invoiceNumber: 1,
          status: 1,
          total: { $ifNull: ['$total', 0] },
          taxBreakdown: 1,
          discounts: 1,
          patient: { $first: '$p' },
        },
      },
    ]);

    const truncated = rows.length > MAX_ROWS;
    const list = rows.slice(0, MAX_ROWS);
    const r2 = (v: number) => Math.round((v || 0) * 100) / 100;
    const name = (r: Row) => [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ');

    type Day = { date: string; invoices: number; first: string; last: string; gross: number; vatable: number; vat: number; exempt: number; zero: number; discount: number; net: number; cancelled: number };
    const days = new Map<string, Day>();
    const totals = { invoices: 0, gross: 0, vatable: 0, vat: 0, exempt: 0, zero: 0, discount: 0, net: 0, cancelled: 0 };
    const statutory: {
      date: string;
      serialNo: string;
      invoiceId: string;
      name: string;
      kind: 'senior' | 'pwd';
      idNumber: string;
      gross: number;
      exemptSales: number;
      discount: number;
      net: number;
    }[] = [];

    for (const r of list) {
      const d = days.get(r.issuedAt) ?? { date: r.issuedAt, invoices: 0, first: r.serialNo, last: r.serialNo, gross: 0, vatable: 0, vat: 0, exempt: 0, zero: 0, discount: 0, net: 0, cancelled: 0 };
      d.last = r.serialNo;
      d.invoices += 1;
      days.set(r.issuedAt, d);
      totals.invoices += 1;
      if (r.status === 'refunded') {
        d.cancelled += 1;
        totals.cancelled += 1;
        continue;
      }
      const t = r.taxBreakdown ?? {};
      const discount = (r.discounts ?? []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const add = { gross: t.grossSales ?? r.total, vatable: t.vatableSales ?? 0, vat: t.vatAmount ?? 0, exempt: t.vatExemptSales ?? 0, zero: t.zeroRatedSales ?? 0, discount, net: r.total };
      for (const k of Object.keys(add) as (keyof typeof add)[]) {
        d[k] += add[k];
        totals[k] += add[k];
      }
      const sc = (r.discounts ?? []).find((x) => x.type === 'senior' || x.type === 'pwd');
      if (sc) {
        statutory.push({
          date: r.issuedAt,
          serialNo: r.serialNo,
          invoiceId: String(r._id),
          name: name(r),
          kind: sc.type as 'senior' | 'pwd',
          idNumber: sc.idNumber ?? '',
          gross: r2(t.grossSales ?? 0),
          exemptSales: r2(t.vatExemptSales ?? 0),
          discount: r2(Number(sc.amount) || 0),
          net: r2(r.total),
        });
      }
    }

    const round = <T extends Record<string, unknown>>(o: T) =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && !['invoices', 'cancelled'].includes(k) ? r2(v) : v])) as T;

    return NextResponse.json({
      success: true,
      data: {
        range: { start: start.toISOString(), end: end.toISOString() },
        truncated,
        totals: round(totals),
        days: [...days.values()].map(round),
        statutory,
        cancelled: list.filter((r) => r.status === 'refunded').map((r) => ({ serialNo: r.serialNo, date: r.issuedAt, invoiceId: String(r._id), name: name(r) })),
      },
    });
  } catch (error) {
    console.error('Error generating BIR books:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate the BIR books' }, { status: 500 });
  }
}
