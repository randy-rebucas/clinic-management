'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TenantNotFoundProps {
  subdomain?: string | null;
}

export default function TenantNotFound({ subdomain }: TenantNotFoundProps) {
  const router = useRouter();
  const [rootDomainUrl, setRootDomainUrl] = useState<string>('');

  useEffect(() => {
    // Get root domain URL from current location
    if (typeof window !== 'undefined') {
      const currentHost = window.location.host;
      const protocol = window.location.protocol;
      const port = window.location.port ? `:${window.location.port}` : '';
      
      // Extract root domain
      // For localhost: if it's subdomain.localhost, use localhost
      // For production: if it's subdomain.example.com, use example.com
      let rootHost = currentHost;
      
      if (currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
        // Local development - remove subdomain if present
        if (currentHost.includes('.localhost')) {
          rootHost = `localhost${port}`;
        } else if (currentHost.includes('.127.0.0.1')) {
          rootHost = `127.0.0.1${port}`;
        }
        // If already localhost without subdomain, keep as is
      } else {
        // Production - extract root domain
        const parts = currentHost.split('.');
        if (parts.length > 2) {
          // Has subdomain, get last two parts (domain.tld)
          // Handle cases like: subdomain.example.com -> example.com
          rootHost = parts.slice(-2).join('.') + port;
        } else if (parts.length === 2) {
          // Already root domain (e.g., example.com)
          rootHost = currentHost;
        }
        // Handle special cases like vercel.app preview URLs
        if (currentHost.includes('.vercel.app')) {
          // For vercel preview URLs, we might want to use a different approach
          // But for now, try to extract the base domain
          const vercelParts = currentHost.split('.');
          if (vercelParts.length > 2) {
            // Extract the base vercel.app domain
            rootHost = vercelParts.slice(-2).join('.') + port;
          }
        }
      }
      
      setRootDomainUrl(`${protocol}//${rootHost}`);
    }
  }, []);

  const handleSetUpClinic = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (rootDomainUrl) {
      window.location.href = `${rootDomainUrl}/tenant-onboard`;
    } else {
      // Fallback if root domain not calculated yet
      router.push('/tenant-onboard');
    }
  };

  const handleGoHome = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (rootDomainUrl) {
      window.location.href = rootDomainUrl;
    } else {
      // Fallback if root domain not calculated yet
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="max-w-lg w-full">
        {/* Main Error Card */}
        <div className="bg-white shadow-2xl rounded-2xl border border-gray-200 overflow-hidden">
          {/* Header with Icon */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-8 text-center">
            <div className="flex items-center justify-center w-20 h-20 mx-auto bg-white/20 backdrop-blur-sm rounded-full mb-4">
              <svg
                className="w-12 h-12 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Clinic Not Found
            </h1>
            <p className="text-blue-100 text-lg">
              The clinic you're looking for doesn't exist or is no longer available
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {subdomain && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-yellow-800 mb-1">
                      Subdomain: <code className="font-mono bg-yellow-100 px-2 py-0.5 rounded">{subdomain}</code>
                    </p>
                    <p className="text-sm text-yellow-700">
                      This subdomain is not registered or the clinic account may have been deactivated.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-semibold text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Check the URL</h3>
                  <p className="text-gray-600 text-sm">
                    Make sure you're using the correct subdomain. The URL should look like: <code className="bg-gray-100 px-1 rounded">subdomain.yourdomain.com</code>
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-semibold text-sm">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Contact Support</h3>
                  <p className="text-gray-600 text-sm">
                    If you believe this is an error, please contact your clinic administrator or our support team.
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-blue-600 font-semibold text-sm">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Set Up Your Clinic</h3>
                  <p className="text-gray-600 text-sm">
                    If you're a new clinic, you can set up your account by registering.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleSetUpClinic}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-semibold shadow-md text-center"
              >
                Set Up Your Clinic
              </button>
              <button
                onClick={handleGoHome}
                className="flex-1 bg-white border-2 border-gray-300 text-gray-700 py-3 px-6 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all font-semibold text-center"
              >
                Go to Homepage
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-500">
                Need help?{' '}
                <a
                  href="mailto:support@clinicmanagement.com"
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  Contact Support
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            © {new Date().getFullYear()} ClinicHub. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

