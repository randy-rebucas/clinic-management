import { loadDocumentPermissions } from '@/lib/documents-page';
import DocumentDetailClient from '@/components/DocumentDetailClient';

export default async function DocumentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const permissions = await loadDocumentPermissions('read');
  const { id } = await params;
  const { saved } = await searchParams;
  return <DocumentDetailClient documentId={id} permissions={permissions} uploaded={saved === 'uploaded'} />;
}
