import { requirePagePermission } from '@/app/lib/auth-helpers';
import VisitFormClient from '@/components/VisitFormClient';

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ patientId?: string; queueId?: string }>;
}) {
  // Require permission to write visits
  await requirePagePermission('visits', 'write');

  // Await searchParams (Next.js 15+ async request APIs)
  const params = await searchParams;

  return <VisitFormClient patientId={params.patientId} queueId={params.queueId} />;
}

