'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSubscriptionStatus } from '@/lib/subscription';

interface SubscriptionPageClientProps {
  user: { role: string; [key: string]: any };
  tenant: {
    _id: string;
    name: string;
    subdomain: string;
    subscription?: {
      plan?: string;
      status?: 'active' | 'cancelled' | 'expired';
      expiresAt?: Date | string;
    };
  } | null;
}

interface SubscriptionStatus {
  isActive: boolean;
  isExpired: boolean;
  isTrial: boolean;
  expiresAt: Date | null;
  plan: string | null;
  daysRemaining: number | null;
}

export default function SubscriptionPageClient({ user, tenant }: SubscriptionPageClientProps) {
  const router = useRouter();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubscriptionStatus() {
      if (!tenant?._id) {
        setError('Tenant information not available');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/subscription/status');
        if (!response.ok) {
          throw new Error('Failed to fetch subscription status');
        }
        const data = await response.json();
        setSubscriptionStatus(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load subscription status');
      } finally {
        setLoading(false);
      }
    }

    fetchSubscriptionStatus();
  }, [tenant?._id]);

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: string) => {
    if (processing) return;
    
    setProcessing(true);
    setSelectedPlan(plan);

    try {
      // Create PayPal order
      const response = await fetch('/api/subscription/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create order');
      }

      const data = await response.json();
      
      // Redirect to PayPal for payment
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        throw new Error('No approval URL received');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to initiate payment');
      setProcessing(false);
      setSelectedPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscription status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    );
  }

  const status = subscriptionStatus || {
    isActive: tenant?.subscription?.status === 'active',
    isExpired: false,
    isTrial: tenant?.subscription?.plan === 'trial',
    expiresAt: tenant?.subscription?.expiresAt ? new Date(tenant.subscription.expiresAt) : null,
    plan: tenant?.subscription?.plan || null,
    daysRemaining: null,
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Subscription Management</h1>
        <p className="mt-2 text-gray-600">
          Manage your clinic subscription and billing
        </p>
      </div>

      {/* Current Subscription Status */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Current Status</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600">Plan</p>
            <p className="text-lg font-medium text-gray-900 capitalize">
              {status.plan || 'No Plan'}
            </p>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              status.isActive && !status.isExpired
                ? 'bg-green-100 text-green-800'
                : status.isExpired
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {status.isActive && !status.isExpired ? 'Active' : status.isExpired ? 'Expired' : 'Inactive'}
            </span>
          </div>

          {status.expiresAt && (
            <>
              <div>
                <p className="text-sm text-gray-600">Expires At</p>
                <p className="text-lg font-medium text-gray-900">
                  {formatDate(status.expiresAt)}
                </p>
              </div>
              
              {status.daysRemaining !== null && (
                <div>
                  <p className="text-sm text-gray-600">Days Remaining</p>
                  <p className={`text-lg font-medium ${
                    status.daysRemaining <= 3 ? 'text-red-600' : 
                    status.daysRemaining <= 7 ? 'text-yellow-600' : 
                    'text-green-600'
                  }`}>
                    {status.daysRemaining} {status.daysRemaining === 1 ? 'day' : 'days'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Trial Information */}
      {status.isTrial && (
        <div className={`rounded-lg p-6 mb-6 ${
          status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3)
            ? 'bg-red-50 border border-red-200'
            : status.daysRemaining !== null && status.daysRemaining <= 7
            ? 'bg-yellow-50 border border-yellow-200'
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3) ? (
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="ml-3 flex-1">
              <h3 className={`text-lg font-medium ${
                status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3)
                  ? 'text-red-800'
                  : 'text-blue-800'
              }`}>
                {status.isExpired 
                  ? 'Trial Period Expired' 
                  : status.daysRemaining !== null && status.daysRemaining <= 3
                  ? 'Trial Ending Soon'
                  : 'Trial Period Active'}
              </h3>
              <div className={`mt-2 text-sm ${
                status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3)
                  ? 'text-red-700'
                  : 'text-blue-700'
              }`}>
                {status.isExpired ? (
                  <p>Your 7-day trial has expired. Please subscribe to continue using the service.</p>
                ) : status.daysRemaining !== null ? (
                  <p>
                    Your trial period expires in {status.daysRemaining} {status.daysRemaining === 1 ? 'day' : 'days'}. 
                    Subscribe now to continue uninterrupted service.
                  </p>
                ) : (
                  <p>You are currently on a 7-day trial period. Enjoy full access to all features!</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Plans */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Plans</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Basic Plan */}
          <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-500 transition-colors">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Basic</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-gray-900">$29</span>
              <span className="text-gray-600">/month</span>
            </div>
            <ul className="space-y-2 mb-6 text-sm text-gray-600">
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Up to 100 patients
              </li>
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Basic support
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('basic')}
              disabled={processing}
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing && selectedPlan === 'basic' ? 'Processing...' : 'Select Plan'}
            </button>
          </div>

          {/* Professional Plan */}
          <div className="border-2 border-blue-500 rounded-lg p-6 relative">
            <div className="absolute top-0 right-0 bg-blue-500 text-white px-3 py-1 rounded-bl-lg text-xs font-semibold">
              POPULAR
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Professional</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-gray-900">$79</span>
              <span className="text-gray-600">/month</span>
            </div>
            <ul className="space-y-2 mb-6 text-sm text-gray-600">
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Up to 500 patients
              </li>
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Priority support
              </li>
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Advanced features
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('professional')}
              disabled={processing}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing && selectedPlan === 'professional' ? 'Processing...' : 'Select Plan'}
            </button>
          </div>

          {/* Enterprise Plan */}
          <div className="border border-gray-200 rounded-lg p-6 hover:border-blue-500 transition-colors">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold text-gray-900">$199</span>
              <span className="text-gray-600">/month</span>
            </div>
            <ul className="space-y-2 mb-6 text-sm text-gray-600">
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Unlimited patients
              </li>
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                24/7 support
              </li>
              <li className="flex items-center">
                <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Custom features
              </li>
            </ul>
            <button
              onClick={() => handleSubscribe('enterprise')}
              disabled={processing}
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing && selectedPlan === 'enterprise' ? 'Processing...' : 'Select Plan'}
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {status.isExpired && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <p className="text-gray-700 mb-4">
              Your subscription has expired. Please select a plan above to continue using the service.
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
