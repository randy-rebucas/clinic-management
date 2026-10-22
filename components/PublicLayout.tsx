import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import PublicHeader from "@/components/PublicHeader";

interface PublicLayoutProps {
  children: React.ReactNode;
}

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
      { href: '/resources', label: 'Resources' },
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

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-teal-dark focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-teal"
        >
          Skip to content
        </a>
        <PublicHeader />

        {/* Main Content - Full Width */}
        <main id="main" tabIndex={-1} className="flex-1 w-full focus:outline-none">
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
                    Built for the PH DPA
                  </Link>
                </div>
              </div>
              {footerColumns.map((col) => (
                <nav key={col.title} aria-label={col.title}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-900 mb-4">{col.title}</h2>
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
