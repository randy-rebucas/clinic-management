import { notFound, redirect } from 'next/navigation';
import BrandLogo from '@/components/BrandLogo';
import { RequestLinkForm } from '@/components/platform/PlatformLoginForms';
import { verifyPlatformSession } from '@/lib/platform-auth';
import { getTenantContext } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function PlatformLoginPage() {
  if ((await getTenantContext()).subdomain) notFound();
  if (await verifyPlatformSession()) redirect('/platform');

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandLogo size={32} />
          <span className="text-sm font-semibold text-gray-900">MyClinicSoft platform console</span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900">Sign in</h1>
          <p className="mb-5 mt-1 text-sm text-gray-600">For the MyClinicSoft team. Clinic staff sign in on their clinic&rsquo;s own address.</p>
          <RequestLinkForm />
        </div>
      </div>
    </div>
  );
}
