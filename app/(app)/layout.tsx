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
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-brand-teal-deep focus:font-semibold focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-brand-teal"
          >
            Skip to main content
          </a>
          <Suspense fallback={
            <div className="hidden lg:block fixed left-0 top-0 h-screen w-[280px] bg-white border-r border-gray-200 z-40">
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-brand-teal-light border-t-brand-teal"></div>
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
