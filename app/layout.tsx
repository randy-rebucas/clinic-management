import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "My Clinic Software",
  description: "Manage patients, appointments, queues, and billing — all in one place.",
  applicationName: "My Clinic Software",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Clinic Software",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
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
 * - (public): Public pages with PublicLayout (onboard, book, patient/login)
 * - (auth): Authentication pages (login)
 * - (app): Authenticated app pages with sidebar (dashboard, patients, etc.)
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
