import InvoiceFormClient from '@/components/InvoiceFormClient';
import { requireInvoiceWriter } from '@/lib/invoices-page';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  // invoices:write, like the API it posts to. It used to ask for "create", which no role has.
  await requireInvoiceWriter();

  const params = await searchParams;
  return <InvoiceFormClient patientId={params.patientId} visitId={params.visitId} />;
}
