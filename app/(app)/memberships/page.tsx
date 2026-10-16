import MembershipsPageClient from '@/components/MembershipsPageClient';
import { loadMembershipPermissions } from '@/lib/memberships-page';

export default async function MembershipsPage({ searchParams }: { searchParams: Promise<{ status?: string; tier?: string }> }) {
  const [permissions, sp] = await Promise.all([loadMembershipPermissions(), searchParams]);
  return <MembershipsPageClient permissions={permissions} initialStatus={sp.status ?? null} initialTier={sp.tier ?? null} />;
}
