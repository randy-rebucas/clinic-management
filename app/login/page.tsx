import LoginForm from '@/components/LoginForm';
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';

export default async function LoginPage() {
  const session = await verifySession();
  
  // If user is already logged in, redirect to dashboard
  if (session) {
    redirect('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome Back
          </h2>
          <p className="text-gray-600 text-sm sm:text-base">
            Sign in to your ClinicHub account
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 sm:p-8">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-600">
          Secure login powered by{' '}
          <span className="font-semibold text-blue-600">ClinicHub</span>
        </p>
      </div>
    </div>
  );
}
