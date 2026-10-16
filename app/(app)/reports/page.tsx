import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { getPermissionChecker } from '@/app/lib/auth-helpers';
import ReportsPageClient from '@/components/ReportsPageClient';
import { REPORTS, canOpenReport, type ReportKey } from '@/lib/reports';

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const session = await verifySession();
  if (!session) redirect('/login');
  const can = await getPermissionChecker(session);
  if (!can('reports', 'read')) redirect('/dashboard?error=access_denied');

  // Only the reports this person may open are offered (the routes check the same rule).
  const allowed = REPORTS.filter((r) => canOpenReport(can, r.key)).map((r) => r.key);
  const { report } = await searchParams;
  const initial = allowed.includes(report as ReportKey) ? (report as ReportKey) : allowed[0] ?? null;

  return <ReportsPageClient allowed={allowed} initial={initial} />;
}
