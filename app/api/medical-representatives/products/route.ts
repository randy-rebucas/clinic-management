import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { sanitizeSearch } from '@/lib/utils';
import { localNow, parseVisitDay } from '@/lib/rep-visit-rules';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { readProductInput, VALID_PRODUCT_STATUSES } from '../_lib/rep-product-input';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Same window as the dashboard's count and the expiry push. */
const EXPIRY_WINDOW_DAYS = 30;

/**
 * Active products by days left, for the app's shelf-life strip. Expiry dates are stored as UTC
 * midnight of their day; days count from today in Manila, as the app's badges do: expired before
 * today, soon = today … +30 days, quarter ≤ +90, half ≤ +180, later after that.
 */
const EXPIRY_BUCKETS = [
  { key: 'expired', before: 0 },
  { key: 'soon', before: EXPIRY_WINDOW_DAYS + 1 },
  { key: 'quarter', before: 91 },
  { key: 'half', before: 181 },
] as const;

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  name: { name: 1, createdAt: -1 },
  expiry: { expiryDate: 1, name: 1 },
};

/**
 * GET /api/medical-representatives/products
 * The rep's products, newest first (`sort=name`: A–Z; `sort=expiry`: soonest expiry first).
 * Query params: page (default 1), limit (default 50, max 100),
 *   status? (active | discontinued | inactive), search? (name, manufacturer or category),
 *   expiring? (1: active products already expired or expiring within 30 days; implies
 *   sort=expiry unless sort is given), summary? (1: also return `expiry`, the rep's active
 *   products counted by time left: expired, soon (≤30 days), quarter (≤90), half (≤180), later;
 *   it ignores the other filters)
 */
export async function GET(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const query: Record<string, unknown> = { ...rep.ownerFilter };
    const status = searchParams.get('status');
    if (status) {
      if (!VALID_PRODUCT_STATUSES.includes(status as typeof VALID_PRODUCT_STATUSES[number])) {
        return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
      }
      query.status = status;
    }
    const search = searchParams.get('search')?.trim();
    if (search) {
      const rx = { $regex: sanitizeSearch(search), $options: 'i' };
      query.$or = [{ name: rx }, { manufacturer: rx }, { category: rx }];
    }
    const todayStart = parseVisitDay(localNow('Asia/Manila').day)!;
    const daysOn = (n: number) => new Date(todayStart.getTime() + n * DAY_MS);
    const expiring = searchParams.get('expiring') === '1';
    if (expiring) {
      query.status = 'active';
      query.expiryDate = { $lt: daysOn(EXPIRY_WINDOW_DAYS + 1) };
    }
    const sortParam = searchParams.get('sort') ?? (expiring ? 'expiry' : 'newest');
    const sort = SORTS[sortParam];
    if (!sort) return NextResponse.json({ success: false, error: 'Invalid sort value.' }, { status: 400 });
    const wantSummary = searchParams.get('summary') === '1';

    await connectDB();

    const [products, total, buckets] = await Promise.all([
      Product.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
      wantSummary
        ? Product.aggregate<{ _id: string; n: number }>([
            { $match: { ...rep.ownerFilter, status: 'active' } },
            {
              $group: {
                _id: {
                  $switch: {
                    branches: EXPIRY_BUCKETS.map((b) => ({
                      case: { $lt: ['$expiryDate', daysOn(b.before)] },
                      then: b.key,
                    })),
                    default: 'later',
                  },
                },
                n: { $sum: 1 },
              },
            },
          ])
        : null,
    ]);

    const expiry = buckets
      ? Object.fromEntries(['expired', 'soon', 'quarter', 'half', 'later'].map((k) => [k, buckets.find((b) => b._id === k)?.n ?? 0]))
      : undefined;

    return NextResponse.json({
      success: true,
      data: products,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      ...(expiry ? { expiry } : {}),
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medical-representatives/products
 * Create a new product
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const input = readProductInput(body);
    if (!input.ok) {
      return NextResponse.json({ success: false, error: input.error }, { status: 400 });
    }

    await connectDB();

    const product = await Product.create({
      ...rep.ownerFilter,
      ...input.value,
      specifications: [],
    });

    return NextResponse.json({
      success: true,
      message: 'Product created successfully',
      data: product,
    });
  } catch (error: any) {
    console.error('Create product error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
