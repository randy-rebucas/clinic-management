'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading subscription status...</p>
          </div>
        </div>
      </section>
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

  const getStatusBadgeClasses = () => {
    if (status.isActive && !status.isExpired) {
      return 'bg-green-100 text-green-800';
    }
    if (status.isExpired) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-yellow-100 text-yellow-800';
  };

  const getStatusText = () => {
    if (status.isActive && !status.isExpired) return 'Active';
    if (status.isExpired) return 'Expired';
    return 'Inactive';
  };

  const getDaysRemainingColor = () => {
    if (status.daysRemaining === null) return 'text-gray-600';
    if (status.daysRemaining <= 3) return 'text-red-600';
    if (status.daysRemaining <= 7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getTrialAlertClasses = () => {
    const isUrgent = status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3);
    const isWarning = status.daysRemaining !== null && status.daysRemaining <= 7;
    
    if (isUrgent) {
      return {
        container: 'bg-red-50 border border-red-200',
        icon: 'text-red-600',
        title: 'text-red-800',
        text: 'text-red-700',
      };
    }
    if (isWarning) {
      return {
        container: 'bg-yellow-50 border border-yellow-200',
        icon: 'text-yellow-600',
        title: 'text-yellow-800',
        text: 'text-yellow-700',
      };
    }
    return {
      container: 'bg-blue-50 border border-blue-200',
      icon: 'text-blue-600',
      title: 'text-blue-800',
      text: 'text-blue-700',
    };
  };

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-red-800 text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-6 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Subscription Management</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage your clinic subscription and billing</p>
                </div>
              </div>
            </div>
          </div>

          {/* Current Subscription Status */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Current Status</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Plan</div>
                </div>
                <div className="text-2xl font-bold text-gray-900 capitalize">
                  {status.plan || 'No Plan'}
                </div>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${
                    status.isActive && !status.isExpired ? 'bg-green-500' :
                    status.isExpired ? 'bg-red-500' : 'bg-yellow-500'
                  }`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">Status</div>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClasses()} ${
                  status.isActive && !status.isExpired ? 'border-green-200' :
                  status.isExpired ? 'border-red-200' : 'border-yellow-200'
                }`}>
                  {getStatusText()}
                </span>
              </div>

              {status.expiresAt && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="text-xs font-semibold text-gray-500 uppercase">Expires At</div>
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    {formatDate(status.expiresAt)}
                  </div>
                </div>
              )}
              
              {status.daysRemaining !== null && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${
                      status.daysRemaining <= 3 ? 'bg-red-500' :
                      status.daysRemaining <= 7 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-xs font-semibold text-gray-500 uppercase">Days Remaining</div>
                  </div>
                  <div className={`text-2xl font-bold ${getDaysRemainingColor()}`}>
                    {status.daysRemaining} {status.daysRemaining === 1 ? 'day' : 'days'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Trial Information */}
          {status.isTrial && (() => {
            const alertClasses = getTrialAlertClasses();
            const isUrgent = status.isExpired || (status.daysRemaining !== null && status.daysRemaining <= 3);
            
            return (
              <div className={`rounded-xl p-6 ${alertClasses.container} shadow-sm`}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className={`p-2 rounded-lg ${
                      isUrgent ? 'bg-red-500' : 
                      status.daysRemaining !== null && status.daysRemaining <= 7 ? 'bg-yellow-500' : 'bg-blue-500'
                    }`}>
                      {isUrgent ? (
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-lg font-bold ${alertClasses.title}`}>
                      {status.isExpired 
                        ? 'Trial Period Expired' 
                        : status.daysRemaining !== null && status.daysRemaining <= 3
                        ? 'Trial Ending Soon'
                        : 'Trial Period Active'}
                    </h3>
                    <div className={`mt-2 text-sm ${alertClasses.text}`}>
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
            );
          })()}

          {/* Subscription Plans */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Available Plans</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Basic Plan */}
              <div className="border border-gray-200 rounded-xl p-6 hover:border-blue-500 hover:shadow-md transition-all">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Basic</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">$29</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Up to 100 patients
                  </li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Basic support
                  </li>
                </ul>
                <button
                  onClick={() => handleSubscribe('basic')}
                  disabled={processing}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing && selectedPlan === 'basic' ? 'Processing...' : 'Select Plan'}
                </button>
              </div>

              {/* Professional Plan */}
              <div className="border-2 border-blue-500 rounded-xl p-6 relative shadow-md">
                <div className="absolute top-0 right-0 bg-blue-500 text-white px-3 py-1 rounded-bl-xl text-xs font-semibold">
                  POPULAR
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Professional</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">$79</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Up to 500 patients
                  </li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Priority support
                  </li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Advanced features
                  </li>
                </ul>
                <button
                  onClick={() => handleSubscribe('professional')}
                  disabled={processing}
                  className="w-full px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing && selectedPlan === 'professional' ? 'Processing...' : 'Select Plan'}
                </button>
              </div>

              {/* Enterprise Plan */}
              <div className="border border-gray-200 rounded-xl p-6 hover:border-blue-500 hover:shadow-md transition-all">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Enterprise</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">$199</span>
                  <span className="text-gray-600">/month</span>
                </div>
                <ul className="space-y-2 mb-6 text-sm text-gray-600">
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Unlimited patients
                  </li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    24/7 support
                  </li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Custom features
                  </li>
                </ul>
                <button
                  onClick={() => handleSubscribe('enterprise')}
                  disabled={processing}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing && selectedPlan === 'enterprise' ? 'Processing...' : 'Select Plan'}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {status.isExpired && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="text-center">
                <p className="text-gray-700 mb-4 font-medium">
                  Your subscription has expired. Please select a plan above to continue using the service.
                </p>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
