import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import Navigation from "@/components/Navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/components/SidebarContext";
import { SettingsProvider } from "@/components/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getTenantContext, extractSubdomain } from "@/lib/tenant";
import TenantNotFound from "@/components/TenantNotFound";

export const metadata: Metadata = {
  title: "MyClinicSoft",
  description: "Manage patients, appointments, and doctors",
};

/**
 * App Layout (Authenticated Routes)
 * 
 * This layout is used for all authenticated application pages.
 * It includes the sidebar navigation, layout wrapper, and all providers.
 * 
 * If a subdomain is detected but tenant is not found, shows TenantNotFound component.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check if we're on a subdomain
  const headersList = await headers();
  const host = headersList.get('host') || headersList.get('x-forwarded-host');
  const subdomain = extractSubdomain(host);

  // If subdomain exists, verify tenant
  if (subdomain) {
    const tenantContext = await getTenantContext();
    
    // If subdomain was detected but tenant not found, show error page
    if (!tenantContext.tenant && tenantContext.subdomain) {
      return <TenantNotFound subdomain={tenantContext.subdomain} />;
    }
  }

  return (
    <ErrorBoundary>
      <SettingsProvider>
        <SidebarProvider>
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
        </SidebarProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

