import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import Navigation from "@/components/Navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/components/SidebarContext";
import { SettingsProvider } from "@/components/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getTenantContext, extractSubdomain } from "@/lib/tenant";
import TenantNotFound from "@/components/TenantNotFound";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clinic Management System",
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
          <Navigation />
          <LayoutWrapper>
            {children}
          </LayoutWrapper>
        </SidebarProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}

