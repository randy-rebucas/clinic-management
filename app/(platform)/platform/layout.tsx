import type { Metadata } from 'next';
import BrandLogo from '@/components/BrandLogo';
import PlatformNav from '@/components/platform/PlatformNav';
import { verifyPlatformSession } from '@/lib/platform-auth';
import { platformLogout } from '@/app/actions/platform-auth';
import connectDB from '@/lib/mongodb';
import SupportRequest from '@/models/SupportRequest';
import { supportWaitingCount } from '@/lib/support-chat';

export const metadata: Metadata = {
  title: 'Platform console',
  robots: { index: false, follow: false },
};

/**
 * The super-admin console: MyClinicSoft's own view across every clinic. Only on the root
 * domain, only for PLATFORM_ADMIN_EMAILS. Signed-out visitors (the sign-in pages) get the
 * bare page; each page checks the session itself.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await verifyPlatformSession();
  if (!session) return <div className="min-h-screen bg-gray-50">{children}</div>;

  await connectDB();
  const [waiting, chatWaiting] = await Promise.all([
    SupportRequest.countDocuments({ status: { $in: ['open', 'in-progress'] }, lastReplyBy: { $ne: 'platform' } }),
    supportWaitingCount(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-navy">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-2.5">
            <BrandLogo size={28} />
            <span className="text-sm font-semibold text-white">MyClinicSoft</span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">Platform</span>
          </div>
          <nav aria-label="Platform console" className="order-last w-full sm:order-none sm:w-auto">
            <PlatformNav waiting={waiting} chatWaiting={chatWaiting} />
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 md:inline">{session.email}</span>
            <form action={platformLogout}>
              <button type="submit" className="rounded-md px-2.5 py-1.5 font-medium text-slate-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
