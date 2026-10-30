import { NextRequest, NextResponse } from 'next/server';
import { recordPatientRefused } from '@/lib/audit';
import connectDB from '@/lib/mongodb';
import Patient from '@/models/Patient';
import logger from '@/lib/logger';
import { patientAuthError, verifyPatientAuth } from '@/app/lib/patient-auth';
import { requireActiveEmcr } from '@/lib/emcr/activation';
import { requestOrigin } from '@/lib/signed-link';
import {
  createShareLink,
  listShareLinks,
  logShareLinkEvent,
  MAX_ACTIVE_SHARE_LINKS,
  parseShareLinkInput,
  toShareLinkView,
} from '@/lib/health-summary-share';

type PatientLean = { _id: unknown; active?: boolean; email?: string; tenantIds?: unknown[] };

/** 404 / 403 for a missing or inactive record, as the other /me routes answer. */
async function refuseInactive(request: NextRequest, patientId: string): Promise<NextResponse | null> {
  await connectDB();
  const patient = await Patient.findById(patientId).select('active email tenantIds').lean<PatientLean | null>();
  if (!patient) return NextResponse.json({ success: false, error: 'Patient not found.' }, { status: 404 });
  if (patient.active === false) {
    await recordPatientRefused(patient, request, 'access');
    return NextResponse.json({ success: false, error: 'Account is inactive.' }, { status: 403 });
  }
  return null;
}

/**
 * GET /api/patients/me/share-links
 * This profile's health-summary share links: live ones and those that ended in the last 90 days,
 * newest first. → { links: ShareLinkView[], maxActive } (lib/health-summary-share.ts). The URL is
 * never listed: only the response that created it carries it.
 */
export async function GET(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);

  try {
    const refused = await refuseInactive(request, session.patientId);
    if (refused) return refused;
    const now = new Date();
    const links = await listShareLinks(session.patientId, now);
    return NextResponse.json({
      success: true,
      data: { links: links.map((l) => toShareLinkView(l, now)), maxActive: MAX_ACTIVE_SHARE_LINKS },
    });
  } catch (error) {
    logger.error('Error listing health summary share links', error as Error);
    return NextResponse.json({ success: false, error: 'Failed to load your shared links' }, { status: 500 });
  }
}

/**
 * POST /api/patients/me/share-links  { duration: '24h' | '7d' | '30d', label?: string }
 * A link anyone can open to download this profile's health summary PDF (the clinics this
 * session sees) until it expires or is revoked. → 201 { url, link: ShareLinkView }.
 * 409 SHARE_LINK_LIMIT when the profile already has MAX_ACTIVE_SHARE_LINKS live links.
 */
export async function POST(request: NextRequest) {
  const session = await verifyPatientAuth(request);
  if (!session) return patientAuthError(request);
  const locked = await requireActiveEmcr(session, 'health_summary');
  if (locked) return locked;

  const parsed = parseShareLinkInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  try {
    const refused = await refuseInactive(request, session.patientId);
    if (refused) return refused;

    const created = await createShareLink(session, parsed.value);
    if (!created.ok) {
      return NextResponse.json(
        {
          success: false,
          code: 'SHARE_LINK_LIMIT',
          error: `You already have ${MAX_ACTIVE_SHARE_LINKS} active links. Revoke one you no longer need first.`,
        },
        { status: 409 }
      );
    }
    await logShareLinkEvent({ event: 'created', link: created.link, session, request });

    return NextResponse.json(
      {
        success: true,
        data: { url: `${requestOrigin(request)}/api/share/${created.token}`, link: toShareLinkView(created.link) },
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    logger.error('Error creating health summary share link', error as Error);
    return NextResponse.json({ success: false, error: 'Could not create the link. Try again.' }, { status: 500 });
  }
}
