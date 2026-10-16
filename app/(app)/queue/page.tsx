import QueuePageClient from '@/components/QueuePageClient';
import { loadQueuePageContext } from '@/lib/queue-page';

export default async function QueuePage() {
  const { permissions, doctors } = await loadQueuePageContext();
  return <QueuePageClient permissions={permissions} doctors={doctors} />;
}
