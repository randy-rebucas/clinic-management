import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Parse and validate a JSON request body against a zod schema.
 * Unknown keys are stripped (zod's default), which prevents mass assignment of
 * fields such as tenantId, password, status or totals.
 *
 * Returns the parsed data, or a 400 NextResponse that the caller should return.
 */
export async function parseBody<T extends z.ZodType>(
  request: NextRequest | Request,
  schema: T
): Promise<{ data: z.infer<T> } | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 }
    );
  }
  return { data: result.data };
}

export function isValidationError<T>(value: { data: T } | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

/** Common field schemas. */
export const zObjectId = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
export const zEmail = z.string().trim().toLowerCase().email().max(254);
export const zPhone = z.string().trim().min(7).max(20).regex(/^[+0-9 ()-]+$/, 'Invalid phone number');
export const zShortText = z.string().trim().max(200);
export const zLongText = z.string().max(20000);
export const zMoney = z.number().finite().min(0).max(100_000_000);

/**
 * Reject anything that isn't a plain string. Use when a value from the request goes
 * into a Mongo filter, so `{ "$ne": null }` style operator injection is impossible.
 */
export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Escape a user-supplied string for safe use inside a RegExp / $regex. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Round a currency amount to centavos. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
