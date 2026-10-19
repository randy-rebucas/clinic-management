import { requirePagePermission } from '@/app/lib/auth-helpers';
import HmoBatchClient from '@/components/hmo/HmoBatchClient';

export const dynamic = 'force-dynamic';

export default async function HmoBatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission('invoices', 'write');
  const { id } = await params;
  return <HmoBatchClient id={id} />;
}
