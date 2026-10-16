import PrescriptionsPageClient from '@/components/PrescriptionsPageClient';
import { loadPrescriptionsPageContext } from '@/lib/prescriptions-page';

export default async function PrescriptionsPage() {
  const context = await loadPrescriptionsPageContext();
  return <PrescriptionsPageClient {...context} />;
}
