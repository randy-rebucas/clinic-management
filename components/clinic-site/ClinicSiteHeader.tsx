'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ClinicMark from '@/components/clinic-site/ClinicMark';

interface ClinicSiteHeaderProps {
  name: string;
  logo?: string;
  phone?: string;
  /** Home-page sections this clinic has content for (no doctors → no "Doctors" link). */
  hasDoctors: boolean;
  hasServices: boolean;
  /** A staff member is signed in on this clinic: offer the dashboard instead of the log-in link. */
  signedIn: boolean;
}

const PHONE_ICON =
  'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z';

/** Header of a clinic's public website (its subdomain), in place of the MyClinicSoft site header. */
export default function ClinicSiteHeader({ name, logo, phone, hasDoctors, hasServices, signedIn }: ClinicSiteHeaderProps) {
  const sections = [
    ...(hasDoctors ? [{ href: '/#doctors', label: 'Doctors' }] : []),
    ...(hasServices ? [{ href: '/#services', label: 'Services' }] : []),
    { href: '/#hours', label: 'Hours' },
    { href: '/#contact', label: 'Contact' },
  ];
  const tel = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const staffLink = signedIn
    ? { href: '/dashboard', label: 'Open dashboard' }
    : { href: '/login', label: 'Staff log in' };
  const bookActive = pathname === '/book' || pathname.startsWith('/book/');

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 lg:gap-6">
          <Link href="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0" onClick={close}>
            <ClinicMark name={name} logo={logo} size={36} />
            <span className="text-base sm:text-lg font-bold text-gray-900 tracking-tight truncate">{name}</span>
          </Link>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 mr-auto">
            {sections.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="px-3 py-2 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150"
              >
                {s.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {tel && (
              <a
                href={tel}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-700 rounded-md hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150 tabular-nums"
              >
                <svg aria-hidden="true" className="w-4 h-4 text-brand-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={PHONE_ICON} />
                </svg>
                {phone}
              </a>
            )}
            <Link
              href={staffLink.href}
              className="px-3 py-2 text-sm font-semibold text-gray-700 rounded-md hover:text-gray-900 hover:bg-gray-100 transition-colors duration-150"
            >
              {staffLink.label}
            </Link>
            <Link
              href="/book"
              aria-current={bookActive ? 'page' : undefined}
              className="px-4 py-2 text-sm bg-brand-teal text-white font-semibold rounded-md hover:bg-brand-teal-dark transition-colors duration-150"
            >
              Book appointment
            </Link>
          </div>

          {tel && (
            <a
              href={tel}
              aria-label={`Call ${name}`}
              className="lg:hidden ml-auto p-2 rounded-lg text-brand-teal-dark hover:bg-gray-100 transition-colors"
            >
              <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={PHONE_ICON} />
              </svg>
            </a>
          )}
          <button
            ref={buttonRef}
            onClick={() => setOpen(!open)}
            className="lg:hidden -mr-2 p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="clinic-mobile-menu"
          >
            <svg aria-hidden="true" className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {open && (
          <div id="clinic-mobile-menu" className="lg:hidden border-t border-gray-200 pb-5 pt-3">
            <nav aria-label="Mobile">
              <ul>
                {[...sections, { href: '/onboard', label: 'Register as a patient' }].map((s) => (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      onClick={close}
                      className="block px-3 py-2.5 text-base font-medium rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2 border-t border-gray-200 pt-4 mt-3">
                <Link
                  href={staffLink.href}
                  onClick={close}
                  className="px-4 py-3 text-sm font-semibold text-gray-900 rounded-lg border border-gray-300 text-center hover:border-gray-900 transition-colors"
                >
                  {staffLink.label}
                </Link>
                <Link
                  href="/book"
                  onClick={close}
                  className="px-4 py-3 text-sm bg-brand-teal text-white font-semibold rounded-lg hover:bg-brand-teal-dark transition-colors text-center"
                >
                  Book appointment
                </Link>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
