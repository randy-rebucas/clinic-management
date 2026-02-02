'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function MedicalRepresentativeLoginClient() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Create FormData for the login action
            const formData = new FormData();
            formData.append('email', email.toLowerCase().trim());
            formData.append('password', password);
            const res = await fetch('/api/medical-representatives/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.toLowerCase().trim(),
                    password: password,
                }),
            });

            const data = await res.json();
            console.log('Login response data:', data);
            if (!res.ok || data?.error || data?.errors) {
                const errorMsg = data?.error
                    || data?.errors?.email?.[0]
                    || data?.errors?.password?.[0]
                    || 'Login failed. Please try again.';
                setError(errorMsg);
                setLoading(false);
                return;
            }

            // Successful login, redirect to dashboard
            router.push('/medical-representative/portal');
            router.refresh();
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'Login failed. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Background Elements */}
            <div className="fixed inset-0 -z-10">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-purple-50 to-indigo-50"></div>
                <div className="absolute top-0 -left-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
                <div className="absolute top-0 -right-4 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
            </div>

            {/* Main Content */}
            <div className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
                <div className="w-full max-w-md">
                    {/* Header */}
                    <div className="text-center mb-8 sm:mb-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl sm:rounded-3xl shadow-xl mb-4 sm:mb-6 transform hover:scale-105 transition-transform">
                            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">Medical Rep Login</h1>
                        <p className="text-base sm:text-lg text-gray-600">Access your medical representative account</p>
                    </div>

                    {/* Login Card */}
                    <div className="bg-white/90 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-200/50 overflow-hidden mb-4 sm:mb-6 p-6 sm:p-8">
                        {/* Error Message */}
                        {error && (
                            <div className="mb-6 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 shadow-lg">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                    </svg>
                                    <p className="text-sm sm:text-base text-red-800 font-semibold">{error}</p>
                                </div>
                            </div>
                        )}

                        {/* Login Form */}
                        <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6">
                            <div>
                                <label htmlFor="email" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="your.email@example.com"
                                    required
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-purple-300 text-base"
                                    disabled={loading}
                                />
                            </div>

                            <div>
                                <label htmlFor="password" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder="••••••••"
                                    required
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-purple-300 text-base"
                                    disabled={loading}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !email || !password}
                                className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl sm:rounded-2xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-base sm:text-lg"
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Logging in...
                                    </span>
                                ) : (
                                    'Login'
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="relative my-6 sm:my-8">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-200"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">or</span>
                            </div>
                        </div>

                        {/* Help Text */}
                        <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4 text-center">
                            <p className="text-sm text-gray-700 mb-2">Don't have a login yet?</p>
                            <p className="text-sm text-gray-600">
                                Complete your registration at{' '}
                                <Link href="/medical-representatives/onboard" className="text-purple-600 hover:text-purple-700 font-semibold underline decoration-2 underline-offset-2">
                                    Medical Representative Onboarding
                                </Link>
                            </p>
                        </div>
                    </div>

                    {/* Footer Links */}
                    <div className="text-center space-y-3 sm:space-y-4">
                        <p className="text-sm sm:text-base text-gray-600">
                            <Link href="/" className="text-purple-600 hover:text-purple-700 font-semibold underline decoration-2 underline-offset-2">
                                Back to Home
                            </Link>
                        </p>
                        <p className="text-sm sm:text-base text-gray-600">
                            Are you a staff member?{' '}
                            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
                                Staff Login
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
