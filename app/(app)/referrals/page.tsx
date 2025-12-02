import { requirePagePermission } from '@/app/lib/auth-helpers';
import ReferralsPageClient from '@/components/ReferralsPageClient';

export default async function ReferralsPage() {
  // Require permission to read referrals
  await requirePagePermission('referrals', 'read');

  return <ReferralsPageClient />;
}

