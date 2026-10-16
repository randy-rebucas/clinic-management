import { redirect } from 'next/navigation';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { verifySession } from '@/app/lib/dal';
import { tenantFilter } from '@/lib/api/tenant-session';
import { loadDoctorPermissions } from '@/lib/doctors-page';
import DoctorNewClient from '@/components/doctors/DoctorNewClient';

export default async function NewDoctorPage({ searchParams }: { searchParams: Promise<{ self?: string }> }) {
  // Adding is doctors:write, the same permission POST /api/doctors checks.
  const permissions = await loadDoctorPermissions('write');
  const { self } = await searchParams;
  if (self !== '1') return <DoctorNewClient self={null} />;

  if (permissions.myDoctorId) redirect(`/doctors/${permissions.myDoctorId}`);
  const session = await verifySession();
  if (!session?.tenantId) redirect('/doctors');
  await connectDB();
  const user = await User.findOne(tenantFilter(session.tenantId, { _id: session.userId }))
    .select('name email')
    .lean<{ name?: string; email?: string } | null>();
  const parts = (user?.name ?? '').trim().split(/\s+/).filter(Boolean);
  return (
    <DoctorNewClient
      self={{
        // A guess from the one-line login name; the form shows it for checking.
        firstName: parts[0] ?? '',
        lastName: parts.slice(1).join(' '),
        email: user?.email ?? session.email ?? '',
        phone: '',
      }}
    />
  );
}
