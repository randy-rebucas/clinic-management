import type { Metadata } from "next";
import { NO_INDEX } from "@/lib/seo";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Navigation from "@/components/Navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/components/SidebarContext";
import { SettingsProvider } from "@/components/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { headers } from "next/headers";
import { getTenantContext, getTenantSubdomain } from "@/lib/tenant";
import { clinicHostRedirect } from "@/lib/subdomain";
import { verifySession } from "@/app/lib/dal";
import TenantNotFound from "@/components/TenantNotFound";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

/**
 * The header's account info, read on the server so the header never renders without it.
 * The session already carries id, email and role; only the display name needs a lookup,
 * and if that fails the email stands in rather than hiding the header controls.
 */
async function loadHeaderUser(session: { userId: string; email: string; role: string }) {
  let name = '';
  try {
    await connectDB();
    const doc = (await User.findById(session.userId).select('name').lean()) as { name?: string } | null;
    name = doc?.name?.trim() || '';
  } catch (err) {
    console.error('Error loading header user:', err);
  }
  return {
    id: session.userId,
    name: name || session.email.split('@')[0] || 'Account',
    role: session.role || 'user',
    email: session.email,
  };
}

export const metadata: Metadata = {
  title: { default: "MyClinicSoft", template: "%s | MyClinicSoft" },
  robots: NO_INDEX,
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Verify session — redirect to login if unauthenticated
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }

  // Single tenant context call — internally reads host header and queries DB
  const tenantContext = await getTenantContext();

  // Clinic staff use their clinic's own subdomain: the main site (www) or another clinic's
  // subdomain would show the console without the clinic's identity. The session cookie is
  // shared across subdomains, so this is where that is enforced.
  if (session.tenantId && tenantContext.tenantId !== session.tenantId) {
    const h = await headers();
    const host = (h.get('x-forwarded-host') || h.get('host') || '').toLowerCase();
    const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    // A lookup failure leaves the page as it is: /login would bounce a signed-in user straight back.
    let target: string | null = null;
    try {
      const subdomain = await getTenantSubdomain(session.tenantId);
      target = clinicHostRedirect(host, proto, subdomain, h.get('x-pathname') || '/dashboard');
    } catch (err) {
      console.error('Staff session has no clinic subdomain:', err);
    }
    if (target) redirect(target);
  }

  // Subdomain detected but no matching active tenant — show error page
  if (tenantContext.subdomain && !tenantContext.tenant) {
    return <TenantNotFound subdomain={tenantContext.subdomain} />;
  }

  const headerUser = await loadHeaderUser(session);

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <SidebarProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-brand-teal-deep focus:font-semibold focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-brand-teal"
          >
            Skip to main content
          </a>
          {session.imp && (
            <div role="status" className="fixed inset-x-0 top-0 z-[90] flex flex-wrap items-center justify-center gap-x-3 bg-amber-400 px-4 py-1.5 text-center text-sm text-brand-navy">
              <span>
                <strong className="font-semibold">Platform view</strong> — you are seeing this clinic as {session.email}, read-only. Signed in as {session.imp}.
              </span>
              <a href="/api/platform/view-as/exit" className="font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy rounded">
                Exit
              </a>
            </div>
          )}
          <Suspense fallback={
            <div className="hidden lg:block fixed left-0 top-0 h-screen w-[280px] bg-white border-r border-gray-200 z-40">
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-brand-teal-light border-t-brand-teal"></div>
              </div>
            </div>
          }>
            <Navigation />
          </Suspense>
          <LayoutWrapper initialUser={headerUser}>
            {children}
          </LayoutWrapper>
          <ServiceWorkerRegistration />
        </SidebarProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
