'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center">
        <div className="mb-6">
          <svg className="w-20 h-20 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome!</h1>
        <p className="text-gray-600 mb-2">Your medical representative account has been successfully created.</p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 my-6 text-left">
          <h3 className="font-semibold text-green-800 mb-2">What happens next?</h3>
          <ul className="text-sm text-green-700 space-y-2">
            <li className="flex items-start">
              <span className="text-green-600 font-bold mr-2">✓</span>
              <span>Your registration has been received and processed</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 font-bold mr-2">✓</span>
              <span>Payment has been verified and recorded</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 font-bold mr-2">✓</span>
              <span>A confirmation email has been sent to your registered email</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-600 font-bold mr-2">✓</span>
              <span>Your account is now active and ready to use</span>
            </li>
          </ul>
        </div>

        {id && (
          <p className="text-xs text-gray-500 mb-6">
            Registration ID: <span className="font-mono text-gray-700">{id}</span>
          </p>
        )}

        <div className="space-y-3">
          <Link
            href="/medical-representatives/login"
            className="block w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign In to Your Account
          </Link>
          <Link
            href="/"
            className="block w-full px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Return to Home
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Need help?{' '}
            <a href="mailto:support@clinicsoft.com" className="text-blue-600 hover:text-blue-800 font-medium">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" />}>
      <SuccessContent />
    </Suspense>
  );
}
