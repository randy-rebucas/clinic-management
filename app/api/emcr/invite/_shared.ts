import { NextRequest, NextResponse } from 'next/server';
import { findUsableInvite, parseInviteCode, type InviteLean } from '@/lib/emcr/invite';

const FAILURES = {
  invalid: { status: 404, code: 'INVITE_INVALID', error: 'This invite code isn’t valid. Check it, or ask your clinic for a new one.' },
  used: { status: 410, code: 'INVITE_USED', error: 'This invite was already used. Sign in with your phone instead.' },
  expired: { status: 410, code: 'INVITE_EXPIRED', error: 'This invite has expired. Ask your clinic for a new one.' },
} as const;

export function inviteFailure(reason: keyof typeof FAILURES) {
  const { status, ...body } = FAILURES[reason];
  return NextResponse.json({ success: false, ...body }, { status });
}

/** The JSON body and the usable invite named by its `code`, or the error response. */
export async function readInvite(
  request: NextRequest
): Promise<{ body: Record<string, unknown>; invite: InviteLean } | { response: NextResponse }> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return { response: NextResponse.json({ success: false, error: 'Invalid request format' }, { status: 400 }) };
  }
  const code = parseInviteCode(body?.code);
  if (!code) return { response: inviteFailure('invalid') };
  const found = await findUsableInvite(code);
  if (!found.ok) return { response: inviteFailure(found.reason) };
  return { body, invite: found.invite };
}
