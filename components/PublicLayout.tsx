import { ErrorBoundary } from "@/components/ErrorBoundary";
import Link from "next/link";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col">
        {/* Simple Header */}
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 group-hover:from-blue-700 group-hover:to-blue-800 transition-colors">
                  <svg width="16" height="16" fill="none" stroke="white" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <span className="text-lg font-bold bg-gradient-to-r from-blue-700 to-blue-800 bg-clip-text text-transparent">
                  ClinicHub
                </span>
              </Link>

              {/* Navigation Links */}
              <nav className="flex items-center gap-4">
                <Link
                  href="/onboard"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors hidden sm:block"
                >
                  Register
                </Link>
                <Link
                  href="/book"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors hidden sm:block"
                >
                  Book Appointment
                </Link>
                <Link
                  href="/patient/login"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors hidden sm:block"
                >
                  Patient Login
                </Link>
                <Link
                  href="/login"
                  className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors hidden sm:block"
                >
                  Staff Login
                </Link>
                <Link
                  href="/"
                  className="px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                >
                  Home
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content - Full Width */}
        <main className="flex-1 w-full">
          {children}
        </main>

        {/* Simple Footer */}
        <footer className="bg-white border-t border-gray-200 py-4">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center text-sm text-gray-600">
              <p>
                © {new Date().getFullYear()} ClinicHub. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}

