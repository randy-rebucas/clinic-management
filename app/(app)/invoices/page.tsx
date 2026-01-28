import { requirePagePermission } from '@/app/lib/auth-helpers';
import InvoicesPageClient from '@/components/InvoicesPageClient';

export default async function InvoicesPage() {
  // Require permission to read invoices
  await requirePagePermission('invoices', 'read');

  return <InvoicesPageClient />;
}

