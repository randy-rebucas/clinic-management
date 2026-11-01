import { requireAdmin } from '@/app/lib/auth-helpers';
import MedicalRepsWorkspace, { type RepsTab } from '@/components/medical-reps/MedicalRepsWorkspace';

export const metadata = {
  title: 'Medical Representatives',
  description: 'Rep visit requests, deliveries, representatives and visiting hours',
};

const TABS: RepsTab[] = ['visits', 'deliveries', 'reps', 'hours'];

export default async function MedicalRepsPage({ searchParams }: { searchParams: Promise<{ tab?: string; visit?: string; delivery?: string }> }) {
  // Require admin access
  await requireAdmin();
  const { tab, visit, delivery } = await searchParams;

  return (
    <MedicalRepsWorkspace
      initialTab={TABS.includes(tab as RepsTab) ? (tab as RepsTab) : 'visits'}
      focusVisitId={typeof visit === 'string' ? visit : undefined}
      focusDeliveryId={typeof delivery === 'string' ? delivery : undefined}
    />
  );
}
