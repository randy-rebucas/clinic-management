'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BrandLogo from "@/components/BrandLogo";

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

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Site header: the only interactive part of the public layout (active link + mobile menu). */
export default function PublicHeader() {
  const pathname = usePathname() ?? '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setMobileMenuOpen(false);

  // Any navigation closes the menu, including browser back/forward (link clicks close it too).
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setMobileMenuOpen(false);
  }

  // Escape closes the mobile menu and returns focus to its toggle.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  return (
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
            ref={menuButtonRef}
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
                  <p className="px-3 mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
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
  );
}
