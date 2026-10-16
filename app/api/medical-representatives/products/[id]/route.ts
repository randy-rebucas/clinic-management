import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { isValidId, notFound } from '@/lib/api/tenant-session';
import { parseBody, isValidationError } from '@/lib/api/validate';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';

const optionalShort = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().trim().max(200).optional()
);

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(100),
  manufacturer: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  dosage: optionalShort,
  strength: optionalShort,
  packaging: z.string().trim().min(1).max(200),
  expiryDate: z.coerce.date(),
  status: z.enum(['active', 'discontinued', 'inactive']).optional(),
});

/**
 * PUT /api/medical-representatives/products/[id]
 * Update a product
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id: productId } = await params;
    if (!isValidId(productId)) return notFound('Product');

    const parsed = await parseBody(request, updateProductSchema);
    if (isValidationError(parsed)) return parsed;
    const body = parsed.data;

    await connectDB();

    const updatedProduct = await Product.findOneAndUpdate(
      { ...rep.ownerFilter, _id: productId },
      {
        $set: {
          name: body.name,
          category: body.category,
          manufacturer: body.manufacturer,
          description: body.description,
          dosage: body.dosage,
          strength: body.strength,
          packaging: body.packaging,
          expiryDate: body.expiryDate,
          status: body.status || 'active',
        },
      },
      { new: true, runValidators: true }
    ).lean();

    if (!updatedProduct) return notFound('Product');

    return NextResponse.json({
      success: true,
      message: 'Product updated successfully',
      data: updatedProduct,
    });
  } catch (error: any) {
    console.error('Update product error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medical-representatives/products/[id]
 * Delete a product
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    const { id: productId } = await params;
    if (!isValidId(productId)) return notFound('Product');

    await connectDB();

    const deletedProduct = await Product.findOneAndDelete({
      ...rep.ownerFilter,
      _id: productId,
    }).lean();

    if (!deletedProduct) return notFound('Product');

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete product error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
