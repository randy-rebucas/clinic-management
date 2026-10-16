import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Navigation from "@/components/Navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/components/SidebarContext";
import { SettingsProvider } from "@/components/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getTenantContext } from "@/lib/tenant";
import { verifySession } from "@/app/lib/dal";
import TenantNotFound from "@/components/TenantNotFound";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "My Clinic Software",
  description: "Manage patients, appointments, queues, and billing — all in one place.",
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

  // Subdomain detected but no matching active tenant — show error page
  if (tenantContext.subdomain && !tenantContext.tenant) {
    return <TenantNotFound subdomain={tenantContext.subdomain} />;
  }

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <SidebarProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-blue-700 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-blue-500"
          >
            Skip to main content
          </a>
          <Suspense fallback={
            <div className="fixed left-0 top-0 h-screen bg-white border-r border-gray-300 z-40" style={{ width: '280px' }}>
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-100 border-t-blue-600"></div>
              </div>
            </div>
          }>
            <Navigation />
          </Suspense>
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
          <ServiceWorkerRegistration />
        </SidebarProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
