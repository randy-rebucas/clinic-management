import { requirePagePermission } from '@/app/lib/auth-helpers';
import DocumentDetailClient from '@/components/DocumentDetailClient';

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('patients', 'read');

  const { id } = await params;
  return <DocumentDetailClient documentId={id} />;
}
