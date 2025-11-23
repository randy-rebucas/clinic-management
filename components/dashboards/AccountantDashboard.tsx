'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSetting } from '../SettingsContext';

interface DashboardData {
  period: string;
  overview: {
    periodRevenue: number;
    periodBilled: number;
    totalOutstanding: number;
    outstandingInvoiceCount: number;
  };
  financialSummary?: {
    totalInvoices: number;
    paidInvoices: number;
    unpaidInvoices: number;
    partialInvoices: number;
    totalPaid: number;
    totalUnpaid: number;
  };
  permissions: {
    canViewInvoices: boolean;
    canViewReports: boolean;
  };
}

export default function AccountantDashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const router = useRouter();
  const currency = useSetting('billingSettings.currency', 'USD');

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const res = await fetch(`/api/reports/dashboard/role-based?period=${period}`);

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Dashboard API error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch dashboard data');
        }

        setDashboardData(data.data);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [router, period]);

  if (loading || !dashboardData) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </section>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const statCards = [
    dashboardData.permissions.canViewInvoices && {
      title: period === 'today' ? 'Today\'s Revenue' : period === 'week' ? 'This Week\'s Revenue' : 'This Month\'s Revenue',
      value: formatCurrency(dashboardData.overview.periodRevenue),
      href: '/invoices',
      iconColor: 'emerald',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewInvoices && {
      title: period === 'today' ? 'Today\'s Billed' : period === 'week' ? 'This Week\'s Billed' : 'This Month\'s Billed',
      value: formatCurrency(dashboardData.overview.periodBilled),
      href: '/invoices',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewInvoices && {
      title: 'Outstanding Invoices',
      value: dashboardData.overview.outstandingInvoiceCount,
      subtitle: formatCurrency(dashboardData.overview.totalOutstanding),
      href: '/invoices?status=unpaid',
      iconColor: 'red',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ].filter(Boolean);

  const quickActions = [
    dashboardData.permissions.canViewInvoices && {
      title: 'View Invoices',
      href: '/invoices',
      description: 'Manage all invoices',
      iconColor: 'blue',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewInvoices && {
      title: 'Unpaid Invoices',
      href: '/invoices?status=unpaid',
      description: 'View unpaid invoices',
      iconColor: 'red',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    dashboardData.permissions.canViewReports && {
      title: 'Financial Reports',
      href: '/reports',
      description: 'View financial reports',
      iconColor: 'teal',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ].filter(Boolean);

  const getIconBgColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-600',
      emerald: 'bg-emerald-600',
      red: 'bg-red-600',
      teal: 'bg-teal-600',
    };
    return colors[color] || 'bg-gray-600';
  };

  const getIconBgLight = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700',
      emerald: 'bg-emerald-100 text-emerald-700',
      red: 'bg-red-100 text-red-700',
      teal: 'bg-teal-100 text-teal-700',
    };
    return colors[color] || 'bg-gray-100 text-gray-700';
  };

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex justify-between items-center flex-col sm:flex-row gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Accountant Dashboard</h1>
              <p className="text-sm text-gray-500">Financial overview and billing management</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPeriod('today')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'today' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setPeriod('week')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'week' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setPeriod('month')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  period === 'month' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="flex gap-3 flex-wrap">
            {statCards.map((card: any) => (
              <Link key={card.title} href={card.href} className="flex-1 min-w-[250px]">
                <div className="bg-white border border-gray-200 rounded-lg p-4 relative overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-grow">
                      <p className="text-xs text-gray-500 mb-1">{card.title}</p>
                      <p className="text-2xl font-bold">{card.value}</p>
                      {card.subtitle && (
                        <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
                      )}
                    </div>
                    <div className="rounded-md p-2 bg-gray-100">
                      <div className={`rounded-md p-1.5 flex items-center justify-center ${getIconBgColor(card.iconColor)} text-white`}>
                        {card.icon}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Financial Summary */}
          {dashboardData.financialSummary && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-3">Financial Summary</h2>
              <div className="flex gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Invoices</p>
                  <p className="text-xl font-bold">{dashboardData.financialSummary.totalInvoices}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Paid</p>
                  <p className="text-xl font-bold text-green-600">{dashboardData.financialSummary.paidInvoices}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(dashboardData.financialSummary.totalPaid)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Unpaid</p>
                  <p className="text-xl font-bold text-red-600">{dashboardData.financialSummary.unpaidInvoices}</p>
                  <p className="text-xs text-gray-500">{formatCurrency(dashboardData.financialSummary.totalUnpaid)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Partial</p>
                  <p className="text-xl font-bold text-amber-600">{dashboardData.financialSummary.partialInvoices}</p>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">Quick Actions</h2>
            <div className="flex gap-3 flex-wrap">
              {quickActions.map((action: any) => (
                <Link key={action.title} href={action.href} className="flex-1 min-w-[200px]">
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-3 cursor-pointer transition-all hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-md p-2 flex items-center justify-center ${getIconBgLight(action.iconColor)}`}>
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold mb-1">{action.title}</p>
                        <p className="text-xs text-gray-500">{action.description}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
