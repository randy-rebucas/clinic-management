import { requirePagePermission } from '@/app/lib/auth-helpers';
import InvoiceFormClient from '@/components/InvoiceFormClient';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  await requirePagePermission('invoices', 'create');

  const params = await searchParams;
  return <InvoiceFormClient patientId={params.patientId} visitId={params.visitId} />;
}
