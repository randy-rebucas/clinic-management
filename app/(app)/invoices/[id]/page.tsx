import { requirePagePermission } from '@/app/lib/auth-helpers';
import InvoiceDetailClient from '@/components/InvoiceDetailClient';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission('invoices', 'read');

  const { id } = await params;
  return <InvoiceDetailClient invoiceId={id} />;
}
