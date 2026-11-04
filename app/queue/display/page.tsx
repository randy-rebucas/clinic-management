import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NO_INDEX } from '@/lib/seo';
import { getTenantContext } from '@/lib/tenant';
import { getTenantTimezone } from '@/lib/clinic-timezone';
import { canViewQueueDisplay, loadQueueDisplay } from '@/lib/queue-display';
import QueueDisplayClient, { QueueDisplayOff } from '@/components/queue/QueueDisplayClient';

/**
 * The waiting-room screen (<clinic>.<domain>/queue/display): full screen on a TV, outside the
 * staff shell so it can run signed out. ?doctorId= or ?roomId= narrows it to one line.
 */
export const metadata: Metadata = { title: 'Queue', robots: NO_INDEX };

const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : null);

export default async function QueueDisplayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { tenantId, tenant } = await getTenantContext();
  if (!tenantId) notFound();
  if (!(await canViewQueueDisplay(tenantId))) return <QueueDisplayOff />;

  const params = await searchParams;
  const doctorId = one(params.doctorId);
  const roomId = one(params.roomId);
  const [initial, timeZone] = await Promise.all([loadQueueDisplay(tenantId, { doctorId, roomId }), getTenantTimezone(tenantId)]);

  const query = new URLSearchParams();
  if (doctorId) query.set('doctorId', doctorId);
  if (roomId) query.set('roomId', roomId);

  return (
    <QueueDisplayClient
      initial={initial}
      clinicName={tenant?.displayName || tenant?.name || 'Patient queue'}
      timeZone={timeZone}
      query={query.toString()}
    />
  );
}
