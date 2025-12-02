import LoginForm from '@/components/LoginForm';
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import { isSetupComplete } from '@/lib/setup';

export default async function LoginPage() {
  // Check if setup is complete, redirect to setup if not
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect('/setup');
  }

  const session = await verifySession();
  
  // If user is already logged in, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl shadow-xl mb-6 transform transition-transform hover:scale-105">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">
            Welcome Back
          </h1>
          <p className="text-gray-600 text-base">
            Sign in to access your clinic management system
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 sm:p-10 backdrop-blur-sm">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-500">
          <span className="font-medium text-gray-700">Secure login</span>
          {' '}• Powered by{' '}
          <span className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">ClinicHub</span>
        </p>
      </div>
    </div>
  );
}

