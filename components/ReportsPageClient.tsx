'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900 mb-2">Consultations Summary</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-600">Total</div>
                <div className="font-bold text-gray-900">{data.summary?.totalConsultations || 0}</div>
              </div>
            </div>
            {data.summary?.byType && (
              <div className="mt-3">
                <div className="font-medium text-gray-700 mb-1">By Type</div>
                {Object.entries(data.summary.byType).map(([type, count]: [string, any]) => (
                  <div key={type} className="flex justify-between py-1">
                    <span className="text-gray-600 capitalize">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {data.summary?.byProvider && (
              <div className="mt-3">
                <div className="font-medium text-gray-700 mb-1">By Provider</div>
                {Object.entries(data.summary.byProvider).slice(0, 5).map(([provider, count]: [string, any]) => (
                  <div key={provider} className="flex justify-between py-1">
                    <span className="text-gray-600">{provider}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'income':
        return (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900 mb-2">Income Summary</div>
            <div className="space-y-2">
              <div className="p-2 bg-green-50 rounded">
                <div className="text-gray-600">Total Paid</div>
                <div className="font-bold text-green-700">₱{(data.summary?.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-600">Total Billed</div>
                <div className="font-bold text-gray-900">₱{(data.summary?.totalBilled || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="p-2 bg-yellow-50 rounded">
                <div className="text-gray-600">Outstanding</div>
                <div className="font-bold text-yellow-700">₱{(data.summary?.totalOutstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>
            {data.breakdowns?.byPaymentMethod && (
              <div className="mt-3">
                <div className="font-medium text-gray-700 mb-1">By Payment Method</div>
                {Object.entries(data.breakdowns.byPaymentMethod).map(([method, amount]: [string, any]) => (
                  <div key={method} className="flex justify-between py-1">
                    <span className="text-gray-600 capitalize">{method.replace('_', ' ')}</span>
                    <span className="font-medium">₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'demographics':
        return (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900 mb-2">Demographics Summary</div>
            {data.demographics?.ageGroups && (
              <div className="mt-2">
                <div className="font-medium text-gray-700 mb-1">Age Groups</div>
                {Object.entries(data.demographics.ageGroups).map(([age, count]: [string, any]) => (
                  <div key={age} className="flex justify-between py-1">
                    <span className="text-gray-600">{age}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'inventory':
        return (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900 mb-2">Inventory Summary</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-600">Total Items</div>
                <div className="font-bold text-gray-900">{data.summary?.totalItems || 0}</div>
              </div>
              <div className="p-2 bg-red-50 rounded">
                <div className="text-gray-600">Low Stock</div>
                <div className="font-bold text-red-700">{data.summary?.lowStockCount || 0}</div>
              </div>
            </div>
            {data.lowStockItems && data.lowStockItems.length > 0 && (
              <div className="mt-3">
                <div className="font-medium text-gray-700 mb-1">Low Stock Items</div>
                {data.lowStockItems.slice(0, 5).map((item: any) => (
                  <div key={item._id} className="flex justify-between py-1">
                    <span className="text-gray-600 truncate">{item.name}</span>
                    <span className="font-medium text-red-600">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'hmo-claims':
        return (
          <div className="space-y-2 text-xs">
            <div className="font-semibold text-gray-900 mb-2">HMO Claims Summary</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 bg-gray-50 rounded">
                <div className="text-gray-600">Total Claims</div>
                <div className="font-bold text-gray-900">{data.summary?.totalClaims || 0}</div>
              </div>
              <div className="p-2 bg-yellow-50 rounded">
                <div className="text-gray-600">Pending</div>
                <div className="font-bold text-yellow-700">{data.summary?.pendingClaims || 0}</div>
              </div>
            </div>
            <div className="p-2 bg-gray-50 rounded mt-2">
              <div className="text-gray-600">Backlog Amount</div>
              <div className="font-bold text-gray-900">₱{(data.summary?.backlogAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        );
      default:
        return <div className="text-xs text-gray-500">Report data not available</div>;
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading reports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-3">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Reports & Analytics</h1>
        <p className="text-gray-600 text-sm">View clinic performance metrics and reports</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Consultations</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.periodVisits || dashboardData.totalConsultations || 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Income</p>
              <p className="text-xl font-bold text-gray-900">
                ₱{(dashboardData.periodRevenue || dashboardData.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Patients</p>
              <p className="text-xl font-bold text-gray-900">
                {dashboardData.totalPatients || 0}
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Available Reports</p>
              <p className="text-xl font-bold text-gray-900">6</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-900">Available Reports</h2>
            {(selectedReport === 'consultations' || selectedReport === 'income') && (
              <select
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly');
                  if (selectedReport) {
                    fetchReport(selectedReport, e.target.value as 'daily' | 'weekly' | 'monthly');
                  }
                }}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>
          <div className="space-y-2">
            <button
              onClick={() => fetchReport('consultations', period)}
              className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">Consultations Report</div>
              <div className="text-xs text-gray-500">View consultation statistics</div>
            </button>
            <button
              onClick={() => fetchReport('income', period)}
              className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">Income Report</div>
              <div className="text-xs text-gray-500">Financial performance analysis</div>
            </button>
            <button
              onClick={() => fetchReport('demographics')}
              className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">Demographics Report</div>
              <div className="text-xs text-gray-500">Patient demographics analysis</div>
            </button>
            <button
              onClick={() => fetchReport('inventory')}
              className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">Inventory Report</div>
              <div className="text-xs text-gray-500">Inventory status and usage</div>
            </button>
            <button
              onClick={() => fetchReport('hmo-claims')}
              className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">HMO Claims Report</div>
              <div className="text-xs text-gray-500">HMO claims and reimbursements</div>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Report Details</h2>
          {reportLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-blue-600"></div>
                <p className="mt-2 text-xs text-gray-600">Loading report...</p>
              </div>
            </div>
          ) : reportData ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {renderReportDetails(selectedReport!, reportData)}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-xs">
              Select a report to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

