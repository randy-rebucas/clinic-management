import Link from 'next/link';
import { Types } from 'mongoose';
import { requirePlatformPage } from '@/lib/platform-auth';
import connectDB from '@/lib/mongodb';
import Tenant from '@/models/Tenant';
import { SupportBroadcastForm } from '@/components/platform/SupportChat';
import { CARD, LINK } from '@/components/platform/shared';

export const dynamic = 'force-dynamic';

export default async function PlatformChatBroadcastPage({ searchParams }: { searchParams: Promise<{ clinic?: string }> }) {
  await requirePlatformPage();
  const { clinic: clinicId } = await searchParams;
  await connectDB();
  const clinic =
    clinicId && Types.ObjectId.isValid(clinicId)
      ? await Tenant.findById(clinicId).select('name displayName').lean<{ _id: Types.ObjectId; name: string; displayName?: string } | null>()
      : null;
  const clinicName = clinic ? clinic.displayName || clinic.name : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/platform/chat" className={`${LINK} text-sm`}>Support chat</Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Broadcast a message</h1>
        <p className="mt-1 text-sm text-gray-600">
          A chat message from MyClinicSoft Support to many people at once, {clinicName ? `in ${clinicName}` : 'in every active clinic'}.
          For a notice that should also reach phones, use <Link href="/platform/notifications" className={LINK}>Notify</Link>.
        </p>
      </div>
      <section className={`${CARD} p-5`}>
        <SupportBroadcastForm clinic={clinic && clinicName ? { id: String(clinic._id), name: clinicName } : undefined} />
      </section>
    </div>
  );
}
