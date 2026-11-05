import { Types } from 'mongoose';
import connectDB from '@/lib/mongodb';
import MedicalRepresentative from '@/models/MedicalRepresentative';
import User from '@/models/User';
import { generateInviteToken, inviteUpdate, sendSetPasswordEmail } from '@/lib/user-invite';

/**
 * Send the set-password invite held back at signup, once. The flag is cleared in the same update
 * that finds the rep, so a repeated payment webhook can't invite twice, and reps who were invited
 * at creation never match: a second invite would replace the link they already have.
 */
export async function sendDeferredRepInvite(repId: string | Types.ObjectId): Promise<void> {
  await connectDB();
  const rep = await MedicalRepresentative.findOneAndUpdate(
    { _id: repId, inviteDeferred: true },
    { $unset: { inviteDeferred: 1 } }
  )
    .select('userId firstName lastName email')
    .lean<{ _id: Types.ObjectId; userId?: Types.ObjectId; firstName: string; lastName: string; email: string } | null>();
  if (!rep?.userId) return;

  const invite = generateInviteToken();
  await User.updateOne({ _id: rep.userId, medicalRepresentativeProfile: rep._id }, { $set: inviteUpdate(invite) });
  await sendSetPasswordEmail({
    email: rep.email,
    name: `${rep.firstName} ${rep.lastName}`.trim(),
    token: invite.token,
    tenantId: null,
    kind: 'invite',
  });
}
