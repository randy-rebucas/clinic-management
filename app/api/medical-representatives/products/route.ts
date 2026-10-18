import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireRepSession, isRepSessionError } from '../_lib/rep-session';

const VALID_PRODUCT_STATUSES = ['active', 'discontinued', 'inactive'] as const;

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

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const manufacturer = typeof body.manufacturer === 'string' ? body.manufacturer.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const packaging = typeof body.packaging === 'string' ? body.packaging.trim() : '';
    const expiryDate = typeof body.expiryDate === 'string' ? body.expiryDate.trim() : '';
    const dosage = typeof body.dosage === 'string' ? body.dosage.trim() : undefined;
    const strength = typeof body.strength === 'string' ? body.strength.trim() : undefined;
    const status = typeof body.status === 'string' ? body.status.trim() : 'active';

    if (!name || !category || !manufacturer || !description || !packaging || !expiryDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (name.length > 200 || category.length > 100 || manufacturer.length > 200 ||
        description.length > 2000 || packaging.length > 200 ||
        (dosage?.length ?? 0) > 200 || (strength?.length ?? 0) > 200) {
      return NextResponse.json({ success: false, error: 'One or more fields exceed maximum length.' }, { status: 400 });
    }

    if (!VALID_PRODUCT_STATUSES.includes(status as typeof VALID_PRODUCT_STATUSES[number])) {
      return NextResponse.json({ success: false, error: 'Invalid status value.' }, { status: 400 });
    }

    const parsedExpiry = new Date(expiryDate);
    if (isNaN(parsedExpiry.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid expiry date.' }, { status: 400 });
    }

    await connectDB();

    const product = await Product.create({
      ...rep.ownerFilter,
      name,
      category,
      manufacturer,
      description,
      dosage: dosage || undefined,
      strength: strength || undefined,
      packaging,
      expiryDate: parsedExpiry,
      status,
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
