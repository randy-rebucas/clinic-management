import LabResultsPageClient from '@/components/LabResultsPageClient';
import { loadLabResultsPageContext } from '@/lib/lab-results-page';

export default async function LabResultsPage() {
  const context = await loadLabResultsPageContext();
  return <LabResultsPageClient {...context} />;
}
