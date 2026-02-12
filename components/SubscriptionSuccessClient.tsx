'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface SubscriptionSuccessClientProps {
  user: { role: string; [key: string]: any };
  tenant: {
    _id: string;
    name: string;
    subdomain: string;
  } | null;
  token?: string;
  plan?: string;
}

export default function SubscriptionSuccessClient({ user, tenant, token, plan: planProp }: SubscriptionSuccessClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing your payment...');
  const [hasProcessed, setHasProcessed] = useState(false);

  useEffect(() => {
    // Prevent double-processing (React StrictMode or re-renders)
    if (hasProcessed) return;

    async function processPayment() {
      // PayPal returns the order ID as the 'token' query param
      const orderId = searchParams.get('token') || token;
      const plan = searchParams.get('plan') || planProp || 'professional';

      if (!orderId) {
        setStatus('error');
        setMessage('No payment token found. Please try again.');
        return;
      }

      setHasProcessed(true);

      try {
        const response = await fetch('/api/subscription/capture-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ orderId, plan }),
        });

        const data = await response.json();

        if (data.success) {
          setStatus('success');
          setMessage('Your subscription has been activated successfully!');

          // Redirect to dashboard after 3 seconds
          setTimeout(() => {
            router.push('/dashboard');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || 'Payment processing failed. Please contact support.');
        }
      } catch (error: any) {
        setStatus('error');
        setMessage(error.message || 'An error occurred while processing your payment.');
      }
    }

    processPayment();
  }, [searchParams, token, planProp, router, hasProcessed]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        {status === 'processing' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Processing Payment</h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => router.push('/subscription')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to Subscription Page
            </button>
          </>
        )}
      </div>
    </div>
  );
}
