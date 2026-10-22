import { requirePlatformPage } from '@/lib/platform-auth';
import { loadPlatformConfig } from '@/lib/platform-config-page';
import PlatformConfigurationForms from '@/components/platform/PlatformConfigurationForms';

export const dynamic = 'force-dynamic';

export default async function PlatformConfigurationPage() {
  await requirePlatformPage();
  const config = await loadPlatformConfig();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Configuration</h1>
        <p className="text-sm text-gray-500">
          DevCom Digital&rsquo;s invoicing details, the platform&rsquo;s PayMongo account, plan prices and fees. Changes apply to
          new invoices, checkouts and batches; past ones keep what they were issued with.
        </p>
      </div>
      <PlatformConfigurationForms initial={config} />
    </div>
  );
}
