import { notFound } from 'next/navigation';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { ConfirmLinkForm } from '@/components/platform/PlatformLoginForms';
import { getTenantContext } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export default async function PlatformVerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if ((await getTenantContext()).subdomain) notFound();
  const { token } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandLogo size={32} />
          <span className="text-sm font-semibold text-gray-900">MyClinicSoft platform console</span>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="mb-5 text-lg font-semibold text-gray-900">Finish signing in</h1>
          {token ? (
            <ConfirmLinkForm token={token} />
          ) : (
            <p className="text-sm text-gray-600">
              This link is incomplete. <Link href="/platform/login" className="font-medium text-brand-teal-deep hover:underline">Ask for a new one</Link>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
