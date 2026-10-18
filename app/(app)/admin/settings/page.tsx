import { requireAdmin } from '@/app/lib/auth-helpers';
import { loadClinicSettingsPage } from '@/lib/clinic-settings-page';
import ClinicSettingsClient from '@/components/admin/ClinicSettingsClient';

export const dynamic = 'force-dynamic';

/** Administrators and owners only (the save route already refused anyone else). */
export default async function ClinicSettingsPage() {
  const session = await requireAdmin();
  if (!session?.tenantId) throw new Error('No clinic on this session');
  const data = await loadClinicSettingsPage(session.tenantId);
  return <ClinicSettingsClient data={data} />;
}
