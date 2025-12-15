'use client';

import { login } from '@/app/actions/auth';
import { useActionState, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Clinic {
  _id: string;
  name: string;
  displayName: string;
  subdomain: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export default function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [hasSubdomain, setHasSubdomain] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [showClinicSelection, setShowClinicSelection] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSubdomain = async () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        // Extract potential subdomain (first part)
        const firstPart = parts[0]?.toLowerCase();
        // 'www' is not a subdomain - treat it as root domain
        const isWww = firstPart === 'www';
        // If hostname has more than 2 parts AND first part is not 'www', we have a subdomain
        // Or if 2 parts and first is not 'localhost' or 'www'
        const hasSubdomain = !isWww && (
          (parts.length > 2) || 
          (parts.length === 2 && firstPart !== 'localhost')
        );
        setHasSubdomain(hasSubdomain);
        
        if (!hasSubdomain) {
          // No subdomain (including www), fetch available clinics
          fetchClinics();
          setShowClinicSelection(true);
        } else {
          // Has subdomain, get tenant info
          try {
            const subdomain = firstPart;
            const res = await fetch(`/api/tenants/public?subdomain=${subdomain}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.tenant) {
                setSelectedClinic(data.tenant);
              }
            }
          } catch (error) {
            console.error('Failed to fetch tenant info:', error);
          }
        }
      }
    };
    
    checkSubdomain();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoadingClinics(true);
      const res = await fetch('/api/tenants/public');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tenants) {
          setAvailableClinics(data.tenants);
        }
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoadingClinics(false);
    }
  };

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    // Redirect to clinic's subdomain for login
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const rootDomain = window.location.hostname.split('.').slice(-2).join('.');
      const port = window.location.port ? `:${window.location.port}` : '';
      const loginUrl = `${protocol}//${clinic.subdomain}.${rootDomain}${port}/login`;
      window.location.href = loginUrl;
    }
  };

  // If showing clinic selection, render that instead
  if (showClinicSelection && !hasSubdomain) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            Select Your Clinic
          </h3>
          <p className="text-sm sm:text-base text-gray-600 mb-6">
            Please select the clinic you want to log in to.
          </p>
          
          {loadingClinics ? (
            <div className="flex items-center justify-center py-12 sm:py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                </div>
                <p className="text-base sm:text-lg text-gray-600 font-medium">Loading clinics...</p>
              </div>
            </div>
          ) : availableClinics.length === 0 ? (
            <div className="text-center py-12 sm:py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-600 mb-4 text-base sm:text-lg">No clinics available at the moment.</p>
              <Link href="/tenant-onboard" className="inline-block px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105">
                Register a new clinic
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:gap-6 max-h-96 overflow-y-auto pr-2">
              {availableClinics.map((clinic) => (
                <button
                  key={clinic._id}
                  type="button"
                  onClick={() => handleClinicSelect(clinic)}
                  className="w-full p-6 sm:p-8 border-2 border-gray-200 rounded-2xl text-left hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 transition-all shadow-md hover:shadow-xl transform hover:scale-[1.02] bg-white/80 backdrop-blur-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-lg sm:text-xl text-gray-900 mb-2">{clinic.displayName || clinic.name}</h4>
                      {clinic.address && (clinic.address.city || clinic.address.state) && (
                        <p className="text-sm sm:text-base text-gray-600 mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {clinic.phone && (
                        <p className="text-sm text-gray-600 flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {clinic.phone}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="pt-6 border-t border-gray-200/50">
          <p className="text-sm sm:text-base text-gray-600 text-center">
            Don&apos;t see your clinic?{' '}
            <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
              Register a new clinic
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6 sm:space-y-8">
      {/* Email Field */}
      <div>
        <label htmlFor="email" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
          Email Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
              <path d="M2.5 4C2.5 3.17157 3.17157 2.5 4 2.5H12C12.8284 2.5 13.5 3.17157 13.5 4V12C13.5 12.8284 12.8284 13.5 12 13.5H4C3.17157 13.5 2.5 12.8284 2.5 12V4Z" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2.5 5.5L8 9.5L13.5 5.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
          />
        </div>
        {state?.errors?.email && (
          <div className="mt-2 p-3 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl text-sm text-red-800 shadow-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="font-semibold">{state.errors.email[0]}</p>
            </div>
          </div>
        )}
      </div>
      {/* Password Field */}
      <div>
        <label htmlFor="password" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
          Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
              <path d="M4 6V4C4 2.34315 5.34315 1 7 1H9C10.6569 1 12 2.34315 12 4V6M4 6H2C1.44772 6 1 6.44772 1 7V13C1 13.5523 1.44772 14 2 14H14C14.5523 14 15 13.5523 15 13V7C15 6.44772 14.5523 6 14 6H12M4 6H12" stroke="currentColor" strokeWidth="1.2" />
              <rect x="7.5" y="9.5" width="1" height="1" fill="currentColor" />
            </svg>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
          />
        </div>
        {state?.errors?.password && (
          <div className="mt-2 p-3 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl text-sm text-red-800 shadow-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className="font-semibold">{state.errors.password[0]}</p>
            </div>
          </div>
        )}
      </div>

      {/* General Error Message */}
      {state?.message && (
        <div className="p-4 sm:p-5 bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl sm:rounded-2xl text-sm sm:text-base text-red-800 shadow-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="font-semibold">{state.message}</p>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-blue-400 disabled:to-indigo-400 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base sm:text-lg"
        >
          {pending ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* Sign Up Link */}
      <div>
        <p className="text-sm sm:text-base text-gray-600 text-center">
          Don&apos;t have an account?{' '}
          <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
            Register your clinic
          </Link>
        </p>
      </div>
    </form>
  );
}
