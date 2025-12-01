import { requirePagePermission } from '@/app/lib/auth-helpers';
import VisitFormClient from '@/components/VisitFormClient';

export default async function NewVisitPage() {
  // Require permission to write visits
  await requirePagePermission('visits', 'write');

  return <VisitFormClient />;
}

