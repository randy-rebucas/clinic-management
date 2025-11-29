import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import InvoiceDetailClient from '@/components/InvoiceDetailClient';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await verifySession();
  
  if (!session) {
    redirect('/login');
  }

  const { id } = await params;
  return <InvoiceDetailClient invoiceId={id} />;
}

