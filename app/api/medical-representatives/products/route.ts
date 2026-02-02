import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import connectDB from '@/lib/mongodb';

interface ProductData {
  name: string;
  category: string;
  manufacturer: string;
  description: string;
  dosage?: string;
  strength?: string;
  packaging: string;
  expiryDate: string;
  status: 'active' | 'discontinued' | 'inactive';
}

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

    // For now, return empty array - products will be stored in a separate collection
    // This is a placeholder implementation
    return NextResponse.json({
      success: true,
      data: [],
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

    let body: ProductData;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.name || !body.category || !body.manufacturer || !body.description || !body.packaging || !body.expiryDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await connectDB();

    // Create product object (in-memory for now - would be saved to DB in production)
    const product = {
      _id: `product_${Date.now()}`,
      userId: session.userId,
      name: body.name,
      category: body.category,
      manufacturer: body.manufacturer,
      description: body.description,
      dosage: body.dosage || '',
      strength: body.strength || '',
      packaging: body.packaging,
      expiryDate: body.expiryDate,
      status: body.status || 'active',
      specifications: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    console.log('Product created:', product);

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
