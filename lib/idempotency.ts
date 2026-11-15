import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import IdempotencyKey from '@/models/IdempotencyKey';

/** A replay is only useful while the app may still be retrying. */
const KEEP_MS = 24 * 60 * 60 * 1000;
/** A claim this old with no answer is from a request that died: the next try takes it over. */
const ABANDONED_MS = 60 * 1000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Run a create handler at most once per `Idempotency-Key` header (per user and scope). The first
 * successful (2xx) answer is stored and returned again for the same key; a failed answer frees the
 * key, so fixing the input and retrying works. A request without the header (older apps) just runs.
 * A second try while the first is still running gets 409 REQUEST_IN_PROGRESS.
 */
export async function withIdempotency(
  request: NextRequest,
  userId: Types.ObjectId,
  scope: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const key = request.headers.get('idempotency-key')?.trim();
  if (!key || !KEY_PATTERN.test(key)) return handler();

  await connectDB();
  const filter = { userId, scope, key };
  const now = Date.now();
  try {
    await IdempotencyKey.create({ ...filter, state: 'pending', expiresAt: new Date(now + KEEP_MS) });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await IdempotencyKey.findOne(filter).lean<{
      state: 'pending' | 'done';
      statusCode?: number;
      response?: unknown;
      createdAt: Date;
    } | null>();
    if (existing?.state === 'done') {
      return NextResponse.json(existing.response ?? { success: true }, {
        status: existing.statusCode ?? 200,
        headers: { 'Idempotent-Replay': 'true' },
      });
    }
    // Still running, unless the claim was abandoned: then take it over (one taker wins).
    const takenOver = existing
      ? await IdempotencyKey.updateOne(
          { ...filter, state: 'pending', createdAt: { $lt: new Date(now - ABANDONED_MS) } },
          { $set: { createdAt: new Date(now) } }
        )
      : null;
    if (!takenOver || takenOver.modifiedCount !== 1) {
      return NextResponse.json(
        { success: false, error: 'This request is still being saved. Try again in a moment.', code: 'REQUEST_IN_PROGRESS' },
        { status: 409 }
      );
    }
  }

  let response: NextResponse;
  try {
    response = await handler();
  } catch (error) {
    await IdempotencyKey.deleteOne(filter).catch(() => {});
    throw error;
  }

  if (response.status >= 200 && response.status < 300) {
    let body: unknown = null;
    try {
      body = await response.clone().json();
    } catch {
      body = null;
    }
    await IdempotencyKey.updateOne(filter, { $set: { state: 'done', statusCode: response.status, response: body } }).catch(() => {});
  } else {
    await IdempotencyKey.deleteOne(filter).catch(() => {});
  }
  return response;
}
