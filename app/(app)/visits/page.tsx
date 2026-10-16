import VisitsPageClient from '@/components/VisitsPageClient';
import { loadVisitsPageContext } from '@/lib/visits-page';

export default async function VisitsPage() {
  const context = await loadVisitsPageContext();
  return <VisitsPageClient {...context} />;
}
