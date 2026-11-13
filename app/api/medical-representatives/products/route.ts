import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';
import { readProductInput, VALID_PRODUCT_STATUSES } from '../_lib/rep-product-input';

/**
 * GET /api/medical-representatives/products
 * The rep's products, newest first.
 * Query params: page (default 1), limit (default 50, max 100),
 *   status? (active | discontinued | inactive)
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

    await connectDB();

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
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
