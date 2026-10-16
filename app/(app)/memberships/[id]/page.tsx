import MembershipDetailClient from '@/components/MembershipDetailClient';
import { loadMembershipPermissions } from '@/lib/memberships-page';

export default async function MembershipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [permissions, { id }, sp] = await Promise.all([loadMembershipPermissions(), params, searchParams]);
  return <MembershipDetailClient membershipId={id} permissions={permissions} saved={sp.saved ?? null} />;
}
