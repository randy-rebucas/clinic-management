import LoginForm from '@/components/LoginForm';
import { redirect } from 'next/navigation';
import { verifySession } from '@/app/lib/dal';
import Image from 'next/image';

export default async function LoginPage() {
  const session = await verifySession();
  
  // If user is already logged in, redirect to dashboard
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute top-20 right-10 w-72 h-72 border-4 border-blue-200/20 rotate-45 rounded-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo and Header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl shadow-xl mb-6 sm:mb-8 transform transition-transform hover:scale-105">
            <Image src="/logo.png" alt="MyClinicSoft Logo" width={48} height={48} className="w-12 h-12 sm:w-16 sm:h-16" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-3 sm:mb-4 tracking-tight">
            Welcome Back
          </h1>
          <p className="text-base sm:text-lg text-gray-600">
            Sign in to access MyClinicSoft
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-2xl border border-gray-200/50 p-8 sm:p-10 lg:p-12">
          <LoginForm />
        </div>

        {/* Footer */}
        <p className="mt-8 sm:mt-10 text-center text-sm sm:text-base text-gray-500">
          <span className="font-semibold text-gray-700">Secure login</span>
          {' '}• Powered by{' '}
          <span className="font-bold text-blue-600 hover:text-blue-700 transition-colors">MyClinicSoft</span>
        </p>
      </div>
    </div>
  );
}

