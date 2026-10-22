'use client';

import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

interface PublicLayoutProps {
  children: React.ReactNode;
}

const mainNav = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/book', label: 'Book appointment' },
  { href: '/support', label: 'Help' },
];

// Mobile menu, grouped by who it's for.
const mobileGroups = [
  {
    title: 'For clinics',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    title: 'For patients',
    links: [
      { href: '/book', label: 'Book appointment' },
      { href: '/onboard', label: 'Register as patient' },
      { href: '/download', label: 'Get the eMCR app' },
    ],
  },
  {
    title: 'Help',
    links: [
      { href: '/support', label: 'Help center' },
      { href: '/faq', label: 'FAQ' },
      { href: '/contact', label: 'Contact us' },
    ],
  },
];

// Only pages with real, supported content. Demos aren't offered (the free trial replaces them).
const footerColumns = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/compare', label: 'Compare' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/security', label: 'Security' },
    ],
  },
  {
    title: 'Patients',
    links: [
      { href: '/book', label: 'Book appointment' },
      { href: '/onboard', label: 'Register' },
      { href: '/download', label: 'eMCR app' },
      { href: '/faq#patients', label: 'Patient FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/support', label: 'Help center' },
      { href: '/contact', label: 'Contact' },
      { href: '/medical-representatives/onboard', label: 'Medical reps' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms of Service' },
    ],
  },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

export default function PublicLayout({ children }: PublicLayoutProps) {
  const pathname = usePathname() ?? '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMenu = () => setMobileMenuOpen(false);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-18 gap-6">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5 sm:gap-3 shrink-0" onClick={closeMenu}>
                <BrandLogo size={32} rounded="rounded-lg" />
                <span className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                  MyClinicSoft
                </span>
              </Link>

              {/* Desktop Navigation */}
              <nav aria-label="Main" className="hidden lg:flex items-center gap-1 mr-auto">
                {mainNav.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150 ${
                        active ? 'text-brand-teal-dark bg-brand-teal-light/60' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="hidden lg:flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-2 text-sm font-semibold text-gray-700 rounded-md hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150"
                >
                  Staff log in
                </Link>
                <Link
                  href="/tenant-onboard"
                  className="px-4 py-2 text-sm bg-brand-teal text-white font-semibold rounded-md hover:bg-brand-teal-dark transition-colors duration-150"
                >
                  Start free trial
                </Link>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden -mr-2 p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="public-mobile-menu"
              >
                <svg
                  aria-hidden="true"
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>

            {/* Mobile Navigation */}
            {mobileMenuOpen && (
              <div
                id="public-mobile-menu"
                className="lg:hidden max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gray-200 pb-5 pt-4"
              >
                <nav aria-label="Mobile" className="space-y-5">
                  {mobileGroups.map((group) => (
                    <div key={group.title}>
                      <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                        {group.title}
                      </p>
                      <ul>
                        {group.links.map((l) => {
                          const active = isActive(pathname, l.href);
                          return (
                            <li key={l.href}>
                              <Link
                                href={l.href}
                                onClick={closeMenu}
                                aria-current={active ? 'page' : undefined}
                                className={`block px-3 py-2.5 text-base font-medium rounded-lg transition-colors ${
                                  active ? 'text-brand-teal-dark bg-brand-teal-light/60' : 'text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                {l.label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-2 border-t border-gray-200 pt-4">
                    <Link
                      href="/login"
                      onClick={closeMenu}
                      className="px-4 py-3 text-sm font-semibold text-gray-900 rounded-lg border border-gray-300 text-center hover:border-gray-900 transition-colors"
                    >
                      Staff log in
                    </Link>
                    <Link
                      href="/tenant-onboard"
                      onClick={closeMenu}
                      className="px-4 py-3 text-sm bg-brand-teal text-white font-semibold rounded-lg hover:bg-brand-teal-dark transition-colors text-center"
                    >
                      Start free trial
                    </Link>
                  </div>
                </nav>
              </div>
            )}
          </div>
        </header>

        {/* Main Content - Full Width */}
        <main className="flex-1 w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 pt-12 pb-8 sm:pt-14">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-10 mb-12">
              {/* Brand */}
              <div className="col-span-2">
                <Link href="/" className="inline-flex items-center gap-2.5 mb-3">
                  <BrandLogo size={28} rounded="rounded-lg" />
                  <span className="font-bold text-gray-900 tracking-tight">MyClinicSoft</span>
                </Link>
                <p className="text-sm text-gray-600 max-w-xs leading-relaxed mb-5">
                  Clinic management for Philippine clinics — records, scheduling, queues, and billing in one place.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/tenant-onboard"
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-teal px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-teal-dark transition-colors"
                  >
                    Start 14-day free trial
                  </Link>
                  <Link
                    href="/security"
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-brand-teal/50 hover:text-brand-teal-dark transition-colors"
                  >
                    <svg className="w-3.5 h-3.5 text-brand-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    PH DPA compliant
                  </Link>
                </div>
              </div>
              {footerColumns.map((col) => (
                <nav key={col.title} aria-label={col.title}>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-900 mb-4">{col.title}</h3>
                  <ul className="space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} className="text-sm text-gray-600 hover:text-brand-teal-dark transition-colors">
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
            <div className="border-t border-gray-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-gray-500">
              <p className="text-center sm:text-left">
                © {new Date().getFullYear()} MyClinicSoft, a product of{' '}
                <span className="font-semibold text-gray-700">DevCom Digital</span>. All rights reserved.
              </p>
              <a
                href="mailto:support@myclinicsoft.solutions"
                className="hover:text-brand-teal-dark transition-colors"
              >
                support@myclinicsoft.solutions
              </a>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
