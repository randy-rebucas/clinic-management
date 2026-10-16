import InvoiceDetailClient from '@/components/InvoiceDetailClient';
import { loadInvoiceDetailPermissions } from '@/lib/invoices-page';

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const permissions = await loadInvoiceDetailPermissions();

  const { id } = await params;
  const { created } = await searchParams;
  return <InvoiceDetailClient invoiceId={id} permissions={permissions} justCreated={created === '1'} />;
}
