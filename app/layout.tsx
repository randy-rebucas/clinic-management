import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import WebVitals from "@/components/WebVitals";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "https://www.myclinicsoft.solutions";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "My Clinic Software",
    template: "%s | My Clinic Software",
  },
  description:
    "Manage patients, appointments, queues, and billing — all in one place.",
  applicationName: "My Clinic Software",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Clinic Software",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "My Clinic Software",
    title: "My Clinic Software",
    description:
      "Manage patients, appointments, queues, and billing — all in one place.",
  },
  twitter: {
    card: "summary_large_image",
    title: "My Clinic Software",
    description:
      "Manage patients, appointments, queues, and billing — all in one place.",
  },
};

/**
 * Root Layout
 *
 * This is the top-level layout that wraps all route groups.
 * Each route group ((public), (auth), (app)) has its own layout
 * that handles specific UI requirements.
 *
 * Route Groups:
 * - (public): Public pages with PublicLayout (onboard, book, medical-representatives/onboard)
 * Patients and medical representatives use the mobile app (see MOBILE_API.md).
 * - (auth): Authentication pages (login)
 * - (app): Authenticated app pages with sidebar (dashboard, patients, etc.)
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The CSP in proxy.ts uses a per-request nonce, which Next.js can only stamp on its scripts
  // when rendering at request time; a prerendered page would ship un-nonced scripts that the
  // browser blocks. This opts every page into dynamic rendering.
  await connection();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta name="theme-color" content="#0a7f7e" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
