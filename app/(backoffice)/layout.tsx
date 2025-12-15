import { requireSuperAdmin } from '@/app/lib/auth-helpers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from './LogoutButton';

export default async function BackofficeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session;
  try {
    session = await requireSuperAdmin();
  } catch {
    redirect('/backoffice/signin');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/backoffice/overview" className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className="text-xl font-bold text-gray-900">Backoffice</span>
              </Link>
              <nav className="hidden md:flex gap-6 ml-8">
                <Link href="/backoffice/overview" className="text-sm font-medium text-gray-700 hover:text-purple-600">
                  Overview
                </Link>
                <Link href="/backoffice/tenants" className="text-sm font-medium text-gray-700 hover:text-purple-600">
                  Tenants
                </Link>
                <Link href="/backoffice/system" className="text-sm font-medium text-gray-700 hover:text-purple-600">
                  System
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{session.email}</span>
                <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                  Super Admin
                </span>
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

