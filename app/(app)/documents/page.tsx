import { loadDocumentPermissions } from '@/lib/documents-page';
import DocumentsPageClient from '@/components/DocumentsPageClient';

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ filed?: string; expiring?: string; patientId?: string }> }) {
  const permissions = await loadDocumentPermissions('read');
  const params = await searchParams;
  return (
    <DocumentsPageClient
      permissions={permissions}
      initialUnfiled={params.filed === 'none'}
      initialExpiring={params.expiring === '1'}
    />
  );
}
