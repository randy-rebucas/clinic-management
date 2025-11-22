import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InvoiceFormClient from '@/components/InvoiceFormClient';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; visitId?: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const params = await searchParams;
  return <InvoiceFormClient patientId={params.patientId} visitId={params.visitId} />;
}

