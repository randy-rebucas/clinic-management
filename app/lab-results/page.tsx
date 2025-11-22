import { requirePagePermission } from '@/app/lib/auth-helpers';
import LabResultsPageClient from '@/components/LabResultsPageClient';

export default async function LabResultsPage() {
  // Require permission to read lab-results
  await requirePagePermission('lab-results', 'read');

  return <LabResultsPageClient />;
}

