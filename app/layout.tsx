import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import WebVitals from "@/components/WebVitals";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Clinic Management Software`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "clinic management software",
    "clinic management system Philippines",
    "electronic medical records",
    "EMR Philippines",
    "patient records",
    "appointment scheduling",
    "patient queue system",
    "clinic billing",
    "PhilHealth claims",
    "HMO claims",
    "medical clinic software",
  ],
  authors: [{ name: "DevCom Digital" }],
  creator: "DevCom Digital",
  publisher: "DevCom Digital",
  category: "health",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_PH",
    title: `${SITE_NAME} — Clinic Management Software`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Clinic Management Software`,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a7f7e",
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
