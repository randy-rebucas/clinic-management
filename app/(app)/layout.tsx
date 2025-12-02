import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navigation from "@/components/Navigation";
import LayoutWrapper from "@/components/LayoutWrapper";
import { SidebarProvider } from "@/components/SidebarContext";
import { SettingsProvider } from "@/components/SettingsContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

