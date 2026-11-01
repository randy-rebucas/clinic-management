import 'server-only';
import { Types } from 'mongoose';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import Tenant from '@/models/Tenant';
import { notifyStaff } from '@/lib/notify';
import { sendPushToUserDevices } from '@/lib/push-notifications';

const CLINIC_AUDIENCE_ROLES = ['admin', 'owner'];

/** The name reps see for a clinic. */
export async function clinicDisplayName(tenantId: string | Types.ObjectId): Promise<string> {
  const t = await Tenant.findById(tenantId).select('name displayName').lean<{ name?: string; displayName?: string } | null>();
  return t?.displayName || t?.name || 'A clinic';
}

/** Push to a rep's phone (opens Clinics), unless they have no app account yet or switched push off. */
async function pushRep(rep: { userId?: unknown; notificationsEnabled?: boolean }, title: string, body: string, tag: string) {
  if (!rep.userId || rep.notificationsEnabled === false) return;
  try {
    await sendPushToUserDevices(String(rep.userId), { title, body, tag, data: { screen: 'clinics' } });
  } catch (error) {
    console.error('[rep-access] rep push failed:', error);
  }
}

/** A clinic added an existing rep to its representatives: tell the rep it's in their Clinics now. */
export async function notifyRepAddedByClinic(repId: unknown, tenantId: string | Types.ObjectId) {
  const rep = await MedicalRepresentative.findById(repId).select('userId notificationsEnabled').lean<{ userId?: unknown; notificationsEnabled?: boolean } | null>();
  if (!rep) return;
  const clinic = await clinicDisplayName(tenantId);
  await pushRep(rep, 'New clinic', `${clinic} added you to its representatives. You can book visits there now.`, `medrep-clinic-${String(tenantId)}`);
}

/** Tell a rep the clinic's answer to their access request. */
export async function notifyRepOfAccessAnswer(repId: unknown, tenantId: string | Types.ObjectId, approved: boolean, note?: string) {
  const rep = await MedicalRepresentative.findById(repId).select('userId notificationsEnabled').lean<{ userId?: unknown; notificationsEnabled?: boolean } | null>();
  if (!rep) return;
  const clinic = await clinicDisplayName(tenantId);
  const body = approved ? `${clinic} accepted you. You can book visits there now.` : `${clinic} didn't accept your request.`;
  await pushRep(rep, approved ? 'Access granted' : 'Access not granted', note ? `${body} ${note}`.slice(0, 240) : body, `medrep-access-${String(tenantId)}`);
}

/** Tell the clinic's admins a rep asked to be added. */
export async function notifyClinicOfAccessRequest(
  tenantId: string | Types.ObjectId,
  requestId: unknown,
  rep: { name: string; company?: string },
  message?: string
) {
  const who = rep.company ? `${rep.name} (${rep.company})` : rep.name;
  try {
    await notifyStaff({
      tenantId: String(tenantId),
      audience: { roles: CLINIC_AUDIENCE_ROLES },
      type: 'visit',
      priority: 'normal',
      title: 'Rep asks to work with you',
      message: message ? `${who}: ${message}`.slice(0, 300) : `${who} asks to be added to your representatives.`,
      actionUrl: `/medical-reps?tab=reps&request=${String(requestId)}`,
      sender: { kind: 'system', name: who },
      metadata: { repAccessRequestId: String(requestId) },
    });
  } catch (error) {
    console.error('[rep-access] clinic notification failed:', error);
  }
}
