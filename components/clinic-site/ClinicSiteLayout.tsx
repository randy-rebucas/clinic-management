import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import BrandLogo from '@/components/BrandLogo';
import ClinicMark from '@/components/clinic-site/ClinicMark';
import ClinicSiteHeader from '@/components/clinic-site/ClinicSiteHeader';
import type { ClinicWebsiteData } from '@/lib/clinic-website';
import { SITE_URL } from '@/lib/seo';

interface ClinicSiteLayoutProps {
  clinic: ClinicWebsiteData;
  signedIn: boolean;
  children: React.ReactNode;
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="w-4 h-4 mt-0.5 text-brand-teal shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
    </svg>
  );
}

const PIN = 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z';
const PHONE =
  'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z';
const MAIL = 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';

const heading = 'text-xs font-semibold uppercase tracking-[0.14em] text-gray-900 mb-4';
const link = 'inline-block py-1 text-gray-600 hover:text-brand-teal-dark transition-colors';

/**
 * Shell for every public page on a clinic subdomain. Header and footer carry the clinic's
 * name, contact details and hours; MyClinicSoft appears only as the "Powered by" credit, next
 * to its own legal pages (the privacy notice and terms patients agree to on this platform).
 */
export default function ClinicSiteLayout({ clinic, signedIn, children }: ClinicSiteLayoutProps) {
  const tel = clinic.phone ? `tel:${clinic.phone.replace(/[^\d+]/g, '')}` : null;

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-teal-dark focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          Skip to content
        </a>
        <ClinicSiteHeader
          name={clinic.name}
          logo={clinic.logo}
          phone={clinic.phone}
          hasDoctors={clinic.doctors.length > 0}
          hasServices={clinic.services.length > 0}
          signedIn={signedIn}
        />

        <main id="main" tabIndex={-1} className="flex-1 w-full focus:outline-none">
          {children}
        </main>

        <footer className="bg-white border-t border-gray-200 pt-12 pb-8">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 mb-10">
              {/* The clinic */}
              <div className="sm:col-span-2 lg:col-span-2">
                <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
                  <ClinicMark name={clinic.name} logo={clinic.logo} size={32} />
                  <span className="font-bold text-gray-900 tracking-tight break-words">{clinic.name}</span>
                </Link>
                <ul className="space-y-2.5 text-sm max-w-sm">
                  {clinic.address && (
                    <li className="flex items-start gap-2.5 text-gray-600">
                      <Icon d={PIN} />
                      <span>{clinic.address}</span>
                    </li>
                  )}
                  {tel && (
                    <li className="flex items-start gap-2.5">
                      <Icon d={PHONE} />
                      <a href={tel} className={`${link} tabular-nums`}>{clinic.phone}</a>
                    </li>
                  )}
                  {clinic.email && (
                    <li className="flex items-start gap-2.5">
                      <Icon d={MAIL} />
                      <a href={`mailto:${clinic.email}`} className={`${link} break-all`}>{clinic.email}</a>
                    </li>
                  )}
                </ul>
                <Link
                  href="/book"
                  className="mt-5 inline-flex items-center rounded-md bg-brand-teal px-4 py-2 text-sm font-semibold text-white hover:bg-brand-teal-dark transition-colors"
                >
                  Book an appointment
                </Link>
              </div>

              {/* Hours */}
              <div>
                <h2 className={heading}>Clinic hours</h2>
                <dl className="space-y-2 text-sm">
                  {clinic.hoursSummary.map((h) => (
                    <div key={h.days} className="flex justify-between gap-4">
                      <dt className="text-gray-900 font-medium">{h.days}</dt>
                      <dd className={`tabular-nums text-right ${h.text === 'Closed' ? 'text-gray-400' : 'text-gray-600'}`}>{h.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Patients */}
              <nav aria-label="For patients">
                <h2 className={heading}>For patients</h2>
                <ul className="space-y-1 text-sm">
                  <li><Link href="/book" className={link}>Book an appointment</Link></li>
                  <li><Link href="/onboard" className={link}>Register as a patient</Link></li>
                  <li><Link href="/download" className={link}>Get the eMCR app</Link></li>
                  <li><Link href="/#contact" className={link}>Directions &amp; contact</Link></li>
                </ul>
              </nav>
            </div>

            <div className="border-t border-gray-200 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
              <p className="text-center md:text-left">© {new Date().getFullYear()} {clinic.name}. All rights reserved.</p>
              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
                <Link href={signedIn ? '/dashboard' : '/login'} className="inline-block py-1.5 hover:text-brand-teal-dark transition-colors">
                  {signedIn ? 'Open dashboard' : 'Staff log in'}
                </Link>
                <Link href="/privacy" className="inline-block py-1.5 hover:text-brand-teal-dark transition-colors">Privacy</Link>
                <Link href="/terms" className="inline-block py-1.5 hover:text-brand-teal-dark transition-colors">Terms</Link>
                <a href={SITE_URL} className="inline-flex items-center gap-1.5 py-1.5 hover:text-brand-teal-dark transition-colors">
                  <BrandLogo size={16} rounded="rounded" />
                  Powered by MyClinicSoft
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
