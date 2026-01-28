import { requirePagePermission } from '@/app/lib/auth-helpers';
import DocumentsPageClient from '@/components/DocumentsPageClient';

export default async function DocumentsPage() {
  // Require permission to read patients (documents are patient-related)
  await requirePagePermission('patients', 'read');

  return <DocumentsPageClient />;
}

