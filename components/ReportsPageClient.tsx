'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';
import { useSetting } from './SettingsContext';

interface ReportData {
  totalConsultations?: number;
  totalIncome?: number;
  totalPatients?: number;
  [key: string]: any;
}

export default function ReportsPageClient() {
  const [dashboardData, setDashboardData] = useState<ReportData>({});
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const router = useRouter();
  const currency = useSetting('billingSettings.currency', 'PHP');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports/dashboard');
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      
      if (data.success) {
        setDashboardData(data.data?.overview || {});
      } else {
        console.error('Failed to fetch reports:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async (reportType: string, reportPeriod?: 'daily' | 'weekly' | 'monthly') => {
    setReportLoading(true);
    setSelectedReport(reportType);
    try {
      const url = reportPeriod 
        ? `/api/reports/${reportType}?period=${reportPeriod}`
        : `/api/reports/${reportType}`;
      
      const res = await fetch(url);
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const data = await res.json();
      if (data.success) {
        setReportData(data.data);
      } else {
        alert(data.error || 'Failed to fetch report');
        setReportData(null);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
      alert('Failed to fetch report. Please try again.');
      setReportData(null);
    } finally {
      setReportLoading(false);
    }
  };

  const renderReportDetails = (reportType: string, data: any) => {
    switch (reportType) {
      case 'consultations':
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Consultations Summary</h4>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{data.summary?.totalConsultations || 0}</p>
            </div>
            {data.summary?.byType && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wider">By Type</h5>
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(data.summary.byType).map(([type, count]: [string, any]) => (
                    <div key={type} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700 capitalize">{type}</p>
                      <p className="text-sm font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.summary?.byProvider && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-cyan-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wider">By Provider</h5>
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(data.summary.byProvider).slice(0, 5).map(([provider, count]: [string, any]) => (
                    <div key={provider} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700">{provider}</p>
                      <p className="text-sm font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'income':
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Income Summary</h4>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-gradient-to-br from-green-50 to-green-100/50 border border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Paid</p>
                </div>
                <p className="text-3xl font-bold text-green-700">
                  {formatCurrency(data.summary?.totalPaid || 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Billed</p>
                </div>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.summary?.totalBilled || 0)}</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Outstanding</p>
                </div>
                <p className="text-3xl font-bold text-yellow-700">
                  {formatCurrency(data.summary?.totalOutstanding || 0)}
                </p>
              </div>
            </div>
            {data.breakdowns?.byPaymentMethod && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wider">By Payment Method</h5>
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(data.breakdowns.byPaymentMethod).map(([method, amount]: [string, any]) => (
                    <div key={method} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700 capitalize">{method.replace('_', ' ')}</p>
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'demographics':
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Demographics Summary</h4>
            </div>
            {data.demographics?.ageGroups && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Age Groups</h5>
                </div>
                <div className="flex flex-col gap-2">
                  {Object.entries(data.demographics.ageGroups).map(([age, count]: [string, any]) => (
                    <div key={age} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700">{age}</p>
                      <p className="text-sm font-bold text-gray-900">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'inventory':
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900">Inventory Summary</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Items</p>
                </div>
                <p className="text-3xl font-bold text-gray-900">{data.summary?.totalItems || 0}</p>
              </div>
              <div className="bg-gradient-to-br from-red-50 to-red-100/50 border border-red-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Low Stock</p>
                </div>
                <p className="text-3xl font-bold text-red-700">{data.summary?.lowStockCount || 0}</p>
              </div>
            </div>
            {data.lowStockItems && data.lowStockItems.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h5 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Low Stock Items</h5>
                </div>
                <div className="flex flex-col gap-2">
                  {data.lowStockItems.slice(0, 5).map((item: any) => (
                    <div key={item._id} className="flex justify-between items-center py-2 px-3 bg-red-50 rounded-lg border border-red-100">
                      <p className="text-sm font-semibold text-gray-700 truncate max-w-[200px]">
                        {item.name}
                      </p>
                      <p className="text-sm font-bold text-red-700">
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'hmo-claims':
        return (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-gray-900">HMO Claims Summary</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Total Claims</p>
                </div>
                <p className="text-3xl font-bold text-gray-900">{data.summary?.totalClaims || 0}</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border border-yellow-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Pending</p>
                </div>
                <p className="text-3xl font-bold text-yellow-700">{data.summary?.pendingClaims || 0}</p>
              </div>
            </div>
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Backlog Amount</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(data.summary?.backlogAmount || 0)}</p>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-600">Report data not available</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-violet-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-violet-100 border-t-violet-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading reports...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-violet-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-violet-500 to-violet-600 rounded-lg shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Reports & Analytics</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">View clinic performance metrics and reports</p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-b border-blue-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-blue-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Consultations</p>
                </div>
              </div>
              <div className="p-5">
                <p className="text-3xl font-bold text-gray-900">
                  {dashboardData.periodVisits || dashboardData.totalConsultations || 0}
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-b border-emerald-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-emerald-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Income</p>
                </div>
              </div>
              <div className="p-5">
                <p className="text-3xl font-bold text-emerald-600">
                  {formatCurrency(dashboardData.periodRevenue || dashboardData.totalIncome || 0)}
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-b border-purple-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-purple-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Patients</p>
                </div>
              </div>
              <div className="p-5">
                <p className="text-3xl font-bold text-gray-900">
                  {dashboardData.totalPatients || 0}
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-violet-50 to-violet-100/50 border-b border-violet-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="p-2 bg-violet-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Reports</p>
                </div>
              </div>
              <div className="p-5">
                <p className="text-3xl font-bold text-violet-600">6</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Available Reports */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-500 rounded-lg">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Available Reports</h3>
                  </div>
                  {(selectedReport === 'consultations' || selectedReport === 'income') && (
                    <select
                      value={period}
                      onChange={(e) => {
                        setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly');
                        if (selectedReport) {
                          fetchReport(selectedReport, e.target.value as 'daily' | 'weekly' | 'monthly');
                        }
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all text-sm bg-white font-semibold"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>
              </div>
              <div className="p-5">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => fetchReport('consultations', period)}
                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedReport === 'consultations'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedReport === 'consultations' ? 'bg-violet-500' : 'bg-blue-100'
                      }`}>
                        <svg className={`w-5 h-5 ${selectedReport === 'consultations' ? 'text-white' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">Consultations Report</p>
                        <p className="text-xs text-gray-600 mt-0.5">View consultation statistics</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('income', period)}
                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedReport === 'income'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedReport === 'income' ? 'bg-violet-500' : 'bg-emerald-100'
                      }`}>
                        <svg className={`w-5 h-5 ${selectedReport === 'income' ? 'text-white' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">Income Report</p>
                        <p className="text-xs text-gray-600 mt-0.5">Financial performance analysis</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('demographics')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedReport === 'demographics'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedReport === 'demographics' ? 'bg-violet-500' : 'bg-purple-100'
                      }`}>
                        <svg className={`w-5 h-5 ${selectedReport === 'demographics' ? 'text-white' : 'text-purple-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">Demographics Report</p>
                        <p className="text-xs text-gray-600 mt-0.5">Patient demographics analysis</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('inventory')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedReport === 'inventory'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedReport === 'inventory' ? 'bg-violet-500' : 'bg-teal-100'
                      }`}>
                        <svg className={`w-5 h-5 ${selectedReport === 'inventory' ? 'text-white' : 'text-teal-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">Inventory Report</p>
                        <p className="text-xs text-gray-600 mt-0.5">Inventory status and usage</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('hmo-claims')}
                    className={`px-4 py-3 rounded-lg border-2 transition-all text-left ${
                      selectedReport === 'hmo-claims'
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        selectedReport === 'hmo-claims' ? 'bg-violet-500' : 'bg-amber-100'
                      }`}>
                        <svg className={`w-5 h-5 ${selectedReport === 'hmo-claims' ? 'text-white' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-900">HMO Claims Report</p>
                        <p className="text-xs text-gray-600 mt-0.5">HMO claims and reimbursements</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Report Details */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">Report Details</h3>
                </div>
              </div>
              <div className="p-6">
                {reportLoading ? (
                  <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-violet-100 border-t-violet-600"></div>
                    </div>
                    <p className="text-sm text-gray-600 font-medium">Loading report...</p>
                  </div>
                ) : reportData ? (
                  <div className="max-h-[500px] overflow-y-auto">
                    {renderReportDetails(selectedReport!, reportData)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-600">Select a report to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

