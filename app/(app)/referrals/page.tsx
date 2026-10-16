import ReferralsPageClient from '@/components/ReferralsPageClient';
import { loadReferralsPageContext } from '@/lib/referrals-page';

export default async function ReferralsPage() {
  const context = await loadReferralsPageContext();
  return <ReferralsPageClient {...context} />;
}
