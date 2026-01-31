'use client';

import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";
import { useState } from "react";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* Modern Header with Glassmorphism */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 sm:gap-3 group">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 group-hover:from-blue-700 group-hover:to-indigo-700 transition-all shadow-lg group-hover:scale-105">
                  <svg width="16" height="16" className="sm:w-5 sm:h-5" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                  MyClinicSoft
                </span>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-2 lg:gap-4">
                <Link
                  href="/features"
                  className="px-3 py-2 text-sm lg:text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                >
                  Features
                </Link>
                <Link
                  href="/onboard"
                  className="px-3 py-2 text-sm lg:text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                >
                  Register
                </Link>
                <Link
                  href="/patient/login"
                  className="px-3 py-2 text-sm lg:text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                >
                  Patient Login
                </Link>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm lg:text-base bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105"
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
                    className="px-4 py-3 text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                  >
                    Features
                  </Link>
                  <Link
                    href="/onboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                  >
                    Register
                  </Link>
                  <Link
                    href="/book"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                  >
                    Book Appointment
                  </Link>
                  <Link
                    href="/patient/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base text-gray-700 hover:text-blue-600 font-medium transition-colors rounded-lg hover:bg-blue-50"
                  >
                    Patient Login
                  </Link>
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-4 py-3 text-base bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all text-center"
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

        {/* Modern Footer */}
        <footer className="bg-white/80 backdrop-blur-sm border-t border-gray-200/50 py-8 sm:py-12">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Product</h3>
                <ul className="space-y-2">
                  <li><Link href="/features" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Features</Link></li>
                  <li><Link href="/pricing" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Pricing</Link></li>
                  <li><Link href="/demo" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Demo</Link></li>
                  <li><Link href="/integrations" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Integrations</Link></li>
                  <li><Link href="/compare" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Compare</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Company</h3>
                <ul className="space-y-2">
                  <li><Link href="/about" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">About Us</Link></li>
                  <li><Link href="/testimonials" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Testimonials</Link></li>
                  <li><Link href="/contact" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Contact</Link></li>
                  <li><Link href="/security" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Security</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Resources</h3>
                <ul className="space-y-2">
                  <li><Link href="/resources" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Resources</Link></li>
                  <li><Link href="/support" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Support</Link></li>
                  <li><Link href="/faq" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">FAQ</Link></li>
                  <li><Link href="/knowledge-base" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Documentation</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">Legal</h3>
                <ul className="space-y-2">
                  <li><Link href="/privacy" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="text-sm text-gray-600 hover:text-blue-600 transition-colors">Terms of Service</Link></li>
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
                  className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
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
