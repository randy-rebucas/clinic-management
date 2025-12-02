import { requirePagePermission } from '@/app/lib/auth-helpers';
import ReportsPageClient from '@/components/ReportsPageClient';

export default async function ReportsPage() {
  // Require permission to read reports
  await requirePagePermission('reports', 'read');

  return <ReportsPageClient />;
}

