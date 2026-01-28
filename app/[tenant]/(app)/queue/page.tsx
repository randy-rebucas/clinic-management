import { requirePagePermission } from '@/app/lib/auth-helpers';
import QueuePageClient from '@/components/QueuePageClient';

export default async function QueuePage() {
  // Require permission to read queue
  await requirePagePermission('queue', 'read');

  return <QueuePageClient />;
}

