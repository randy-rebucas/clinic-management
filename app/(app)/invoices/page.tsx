import InvoicesPageClient from '@/components/InvoicesPageClient';
import { loadInvoicesPagePermissions } from '@/lib/invoices-page';
import { INVOICE_STATUSES, isAgingKey } from '@/lib/invoices';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; aging?: string; search?: string }>;
}) {
  const permissions = await loadInvoicesPagePermissions();
  const params = await searchParams;
  // Dashboards link here with a filter already chosen (e.g. ?status=open).
  const status = params.status === 'open' || (INVOICE_STATUSES as string[]).includes(params.status ?? '') ? params.status! : '';

  return (
    <InvoicesPageClient
      {...permissions}
      initialStatus={status}
      initialAging={isAgingKey(params.aging) ? params.aging : null}
      initialSearch={(params.search ?? '').slice(0, 100)}
    />
  );
}
