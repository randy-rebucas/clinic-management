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
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Your Clinic</h3>
          <p className="text-sm text-gray-600 mb-4">
            Please select the clinic you want to log in to.
          </p>
          
          {loadingClinics ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : availableClinics.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">No clinics available at the moment.</p>
              <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold text-sm">
                Register a new clinic
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {availableClinics.map((clinic) => (
                <button
                  key={clinic._id}
                  type="button"
                  onClick={() => handleClinicSelect(clinic)}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-blue-300 hover:bg-blue-50 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{clinic.displayName || clinic.name}</h4>
                      {clinic.address && (clinic.address.city || clinic.address.state) && (
                        <p className="text-sm text-gray-600 mb-1">
                          {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                      {clinic.phone && (
                        <p className="text-xs text-gray-500">📞 {clinic.phone}</p>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Don&apos;t see your clinic?{' '}
            <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
              Register a new clinic
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {/* Email Field */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-2">
          Email Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
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
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
        </div>
        {state?.errors?.email && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {state.errors.email[0]}
          </div>
        )}
      </div>
      {/* Password Field */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-2">
          Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
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
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
          />
        </div>
        {state?.errors?.password && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            {state.errors.password[0]}
          </div>
        )}
      </div>

      {/* General Error Message */}
      {state?.message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {state.message}
        </div>
      )}

      {/* Submit Button */}
      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {pending ? (
            <>
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </div>

      {/* Sign Up Link */}
      <div>
        <p className="text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          {/* Signup link removed */}
        </p>
      </div>
    </form>
  );
}
