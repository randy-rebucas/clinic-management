import type { Metadata } from 'next';
import PlatformNav from '@/components/platform/PlatformNav';
import { verifyPlatformSession } from '@/lib/platform-auth';
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
      <PlatformNav waiting={waiting} chatWaiting={chatWaiting} email={session.email} />
      <div className="lg:pl-64 print:pl-0">
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
