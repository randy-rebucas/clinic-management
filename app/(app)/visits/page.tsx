import { requirePagePermission } from '@/app/lib/auth-helpers';
import VisitsPageClient from '@/components/VisitsPageClient';

export default async function VisitsPage() {
  // Require permission to read visits
  await requirePagePermission('visits', 'read');

  return <VisitsPageClient />;
}

