import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Product from '@/models/Product';
import { requireRepSession, isRepSessionError } from '../../_lib/rep-session';
import { MAX_IMPORT_ROWS, productKey, readProductInput, type RepProductInput } from '../../_lib/rep-product-input';

/**
 * POST /api/medical-representatives/products/import
 * Many products at once, from a spreadsheet the app has already parsed:
 *   { products: [{ name, category, manufacturer, description, packaging, expiryDate, dosage?, strength?, status? }] }
 * Each row follows the same rules as POST /products. All or nothing: if any row is invalid,
 * nothing is saved and the answer lists every bad row (400 INVALID_ROWS, `rows[].row` is the
 * index in `products`). A row with the same name and strength as one of the rep's products, or
 * an earlier row, is skipped, so importing the same file twice adds nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const rep = await requireRepSession();
    if (isRepSessionError(rep)) return rep;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    const rows = body?.products;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { success: false, error: `products must be a list of 1 to ${MAX_IMPORT_ROWS} rows.` },
        { status: 400 }
      );
    }

    const valid: { row: number; value: RepProductInput }[] = [];
    const problems: { row: number; error: string }[] = [];
    rows.forEach((raw, row) => {
      const input = raw && typeof raw === 'object' ? readProductInput(raw as Record<string, unknown>) : { ok: false as const, error: 'Not a product.' };
      if (input.ok) valid.push({ row, value: input.value });
      else problems.push({ row, error: input.error });
    });
    if (problems.length) {
      return NextResponse.json(
        { success: false, error: 'Some rows have problems. Nothing was imported.', code: 'INVALID_ROWS', rows: problems },
        { status: 400 }
      );
    }

    await connectDB();

    const existing = await Product.find(rep.ownerFilter).select('name strength').lean<{ name: string; strength?: string }[]>();
    const seen = new Set(existing.map(productKey));
    const toCreate: RepProductInput[] = [];
    const skipped: { row: number; name: string }[] = [];
    for (const { row, value } of valid) {
      const key = productKey(value);
      if (seen.has(key)) {
        skipped.push({ row, name: value.name });
        continue;
      }
      seen.add(key);
      toCreate.push(value);
    }

    if (toCreate.length) {
      await Product.insertMany(toCreate.map((value) => ({ ...rep.ownerFilter, ...value, specifications: [] })));
    }

    return NextResponse.json({
      success: true,
      message: `${toCreate.length} product${toCreate.length === 1 ? '' : 's'} imported`,
      data: { created: toCreate.length, skipped },
    });
  } catch (error: any) {
    console.error('Import products error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
