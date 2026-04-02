import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';

const VALID_PRODUCT_STATUSES = ['active', 'discontinued', 'inactive'] as const;

/**
 * GET /api/medical-representatives/products
 * Get all products for a medical representative
 */
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await connectDB();

    const products = await Product.find({
      tenantId: session.tenantId,
      userId: session.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    console.error('Get products error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
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
    const session = await verifySession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (session.role !== 'medical-representative') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

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
        description.length > 2000 || packaging.length > 200) {
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
      tenantId: session.tenantId,
      userId: session.userId,
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
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
