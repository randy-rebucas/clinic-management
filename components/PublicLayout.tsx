'use client';

import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { useState } from "react";
import BrandLogo from "@/components/BrandLogo";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-200">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-18">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5 sm:gap-3 shrink-0">
                <BrandLogo size={32} rounded="rounded-lg" />
                <span className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">
                  MyClinicSoft
                </span>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1 lg:gap-2">
                <Link
                  href="/features"
                  className="px-3.5 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-md hover:bg-gray-100"
                >
                  Features
                </Link>
                <Link
                  href="/onboard"
                  className="px-3.5 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-md hover:bg-gray-100"
                >
                  Register
                </Link>
                <Link
                  href="/patient/login"
                  className="px-3.5 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-md hover:bg-gray-100"
                >
                  Patient Login
                </Link>
                <Link
                  href="/login"
                  className="ml-2 px-4 py-2 text-sm bg-brand-teal text-white font-semibold rounded-md hover:bg-brand-teal-dark transition-colors"
                >
                  Staff Login
                </Link>
              </nav>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Toggle menu"
              >
                <svg
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
              <div className="md:hidden py-4 border-t border-gray-200 animate-in slide-in-from-top-2">
                <nav className="flex flex-col gap-2">
                  <Link
                    href="/features"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-lg hover:bg-gray-100"
                  >
                    Features
                  </Link>
                  <Link
                    href="/onboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-lg hover:bg-gray-100"
                  >
                    Register
                  </Link>
                  <Link
                    href="/book"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-lg hover:bg-gray-100"
                  >
                    Book Appointment
                  </Link>
                  <Link
                    href="/patient/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-600 hover:text-gray-900 font-medium transition-colors rounded-lg hover:bg-gray-100"
                  >
                    Patient Login
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base bg-brand-teal text-white font-semibold rounded-lg hover:bg-brand-teal-dark transition-colors text-center"
                  >
                    Staff Login
                  </Link>
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
        <footer className="bg-white border-t border-gray-200 py-8 sm:py-12">
          <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Product</h3>
                <ul className="space-y-2">
                  <li><Link href="/features" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Features</Link></li>
                  <li><Link href="/pricing" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Pricing</Link></li>
                  <li><Link href="/demo" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Demo</Link></li>
                  <li><Link href="/integrations" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Integrations</Link></li>
                  <li><Link href="/compare" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Compare</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Company</h3>
                <ul className="space-y-2">
                  <li><Link href="/about" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">About Us</Link></li>
                  <li><Link href="/testimonials" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Testimonials</Link></li>
                  <li><Link href="/contact" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Contact</Link></li>
                  <li><Link href="/security" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Security</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Resources</h3>
                <ul className="space-y-2">
                  <li><Link href="/resources" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Resources</Link></li>
                  <li><Link href="/support" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Support</Link></li>
                  <li><Link href="/faq" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">FAQ</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Legal</h3>
                <ul className="space-y-2">
                  <li><Link href="/privacy" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="text-sm text-gray-600 hover:text-brand-teal transition-colors">Terms of Service</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-center sm:text-left">
                <p className="text-sm text-gray-600">
                  © {new Date().getFullYear()} <span className="font-semibold text-gray-900">MyClinicSoft</span>. All rights reserved.
                </p>
              </div>
              <div className="flex items-center gap-6">
                <a
                  href="mailto:support@myclinicsoft.com"
                  className="text-sm text-gray-600 hover:text-brand-teal transition-colors"
                >
                  Support
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}
