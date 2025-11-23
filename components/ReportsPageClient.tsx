'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';

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
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Consultations Summary</p>
            <div className="flex gap-2 flex-wrap">
              <div className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Total</p>
                  <p className="text-xl font-bold">{data.summary?.totalConsultations || 0}</p>
                </div>
              </div>
            </div>
            {data.summary?.byType && (
              <div>
                <p className="text-sm font-medium mb-2">By Type</p>
                <div className="flex flex-col gap-1">
                  {Object.entries(data.summary.byType).map(([type, count]: [string, any]) => (
                    <div key={type} className="flex justify-between py-1">
                      <p className="text-sm text-gray-600 capitalize">{type}</p>
                      <p className="text-sm font-medium">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.summary?.byProvider && (
              <div>
                <p className="text-sm font-medium mb-2">By Provider</p>
                <div className="flex flex-col gap-1">
                  {Object.entries(data.summary.byProvider).slice(0, 5).map(([provider, count]: [string, any]) => (
                    <div key={provider} className="flex justify-between py-1">
                      <p className="text-sm text-gray-600">{provider}</p>
                      <p className="text-sm font-medium">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'income':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Income Summary</p>
            <div className="flex flex-col gap-2">
              <div className="bg-green-50 rounded-lg border border-green-200">
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Total Paid</p>
                  <p className="text-xl font-bold text-green-700">
                    ₱{(data.summary?.totalPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Total Billed</p>
                  <p className="text-xl font-bold">₱{(data.summary?.totalBilled || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
              <div className="bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Outstanding</p>
                  <p className="text-xl font-bold text-yellow-700">
                    ₱{(data.summary?.totalOutstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
            {data.breakdowns?.byPaymentMethod && (
              <div>
                <p className="text-sm font-medium mb-2">By Payment Method</p>
                <div className="flex flex-col gap-1">
                  {Object.entries(data.breakdowns.byPaymentMethod).map(([method, amount]: [string, any]) => (
                    <div key={method} className="flex justify-between py-1">
                      <p className="text-sm text-gray-600 capitalize">{method.replace('_', ' ')}</p>
                      <p className="text-sm font-medium">₱{amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'demographics':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Demographics Summary</p>
            {data.demographics?.ageGroups && (
              <div>
                <p className="text-sm font-medium mb-2">Age Groups</p>
                <div className="flex flex-col gap-1">
                  {Object.entries(data.demographics.ageGroups).map(([age, count]: [string, any]) => (
                    <div key={age} className="flex justify-between py-1">
                      <p className="text-sm text-gray-600">{age}</p>
                      <p className="text-sm font-medium">{count}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'inventory':
        return (
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">Inventory Summary</p>
            <div className="flex gap-2 flex-wrap">
              <div className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Total Items</p>
                  <p className="text-xl font-bold">{data.summary?.totalItems || 0}</p>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg border border-red-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Low Stock</p>
                  <p className="text-xl font-bold text-red-700">{data.summary?.lowStockCount || 0}</p>
                </div>
              </div>
            </div>
            {data.lowStockItems && data.lowStockItems.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Low Stock Items</p>
                <div className="flex flex-col gap-1">
                  {data.lowStockItems.slice(0, 5).map((item: any) => (
                    <div key={item._id} className="flex justify-between py-1">
                      <p className="text-sm text-gray-600 truncate max-w-[200px]">
                        {item.name}
                      </p>
                      <p className="text-sm font-medium text-red-700">
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
          <div className="flex flex-col gap-3">
            <p className="text-lg font-bold">HMO Claims Summary</p>
            <div className="flex gap-2 flex-wrap">
              <div className="bg-gray-50 rounded-lg border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Total Claims</p>
                  <p className="text-xl font-bold">{data.summary?.totalClaims || 0}</p>
                </div>
              </div>
              <div className="bg-yellow-50 rounded-lg border border-yellow-200 flex-1 min-w-[200px]" style={{ flex: '1 1 200px' }}>
                <div className="flex flex-col gap-1 p-2">
                  <p className="text-xs text-gray-600">Pending</p>
                  <p className="text-xl font-bold text-yellow-700">{data.summary?.pendingClaims || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-col gap-1 p-2">
                <p className="text-xs text-gray-600">Backlog Amount</p>
                <p className="text-xl font-bold">₱{(data.summary?.backlogAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>
        );
      default:
        return <p className="text-sm text-gray-600">Report data not available</p>;
    }
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-3">
            <div className="h-8 w-[200px] bg-gray-200 rounded animate-pulse"></div>
            <div className="h-10 bg-gray-200 rounded animate-pulse"></div>
            <div className="flex gap-3 flex-wrap">
              <div className="h-[150px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 250px' }}></div>
              <div className="h-[150px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 250px' }}></div>
              <div className="h-[150px] bg-gray-200 rounded animate-pulse flex-1" style={{ flex: '1 1 250px' }}></div>
            </div>
            <div className="h-[400px] bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Reports & Analytics</h1>
            <p className="text-sm text-gray-600">View clinic performance metrics and reports</p>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 250px' }}>
              <div className="flex justify-between items-center gap-3 p-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Total Consultations</p>
                  <p className="text-3xl font-bold">
                    {dashboardData.periodVisits || dashboardData.totalConsultations || 0}
                  </p>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" fill="none" stroke="rgb(37 99 235)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 250px' }}>
              <div className="flex justify-between items-center gap-3 p-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Total Income</p>
                  <p className="text-3xl font-bold">
                    ₱{(dashboardData.periodRevenue || dashboardData.totalIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" fill="none" stroke="rgb(22 163 74)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 250px' }}>
              <div className="flex justify-between items-center gap-3 p-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Total Patients</p>
                  <p className="text-3xl font-bold">
                    {dashboardData.totalPatients || 0}
                  </p>
                </div>
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" fill="none" stroke="rgb(147 51 234)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 min-w-[200px]" style={{ flex: '1 1 250px' }}>
              <div className="flex justify-between items-center gap-3 p-4">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Available Reports</p>
                  <p className="text-3xl font-bold">6</p>
                </div>
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" fill="none" stroke="rgb(234 88 12)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 flex-col md:flex-row">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1">
              <div className="flex flex-col gap-3 p-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Available Reports</h3>
                  {(selectedReport === 'consultations' || selectedReport === 'income') && (
                    <select
                      value={period}
                      onChange={(e) => {
                        setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly');
                        if (selectedReport) {
                          fetchReport(selectedReport, e.target.value as 'daily' | 'weekly' | 'monthly');
                        }
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => fetchReport('consultations', period)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div className="flex flex-col items-start gap-1 w-full">
                      <p className="text-sm font-medium">Consultations Report</p>
                      <p className="text-xs text-gray-600">View consultation statistics</p>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('income', period)}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div className="flex flex-col items-start gap-1 w-full">
                      <p className="text-sm font-medium">Income Report</p>
                      <p className="text-xs text-gray-600">Financial performance analysis</p>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('demographics')}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div className="flex flex-col items-start gap-1 w-full">
                      <p className="text-sm font-medium">Demographics Report</p>
                      <p className="text-xs text-gray-600">Patient demographics analysis</p>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('inventory')}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div className="flex flex-col items-start gap-1 w-full">
                      <p className="text-sm font-medium">Inventory Report</p>
                      <p className="text-xs text-gray-600">Inventory status and usage</p>
                    </div>
                  </button>
                  <button
                    onClick={() => fetchReport('hmo-claims')}
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
                  >
                    <div className="flex flex-col items-start gap-1 w-full">
                      <p className="text-sm font-medium">HMO Claims Report</p>
                      <p className="text-xs text-gray-600">HMO claims and reimbursements</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1">
              <div className="flex flex-col gap-3 p-3">
                <h3 className="text-lg font-semibold">Report Details</h3>
                {reportLoading ? (
                  <div className="flex justify-center items-center" style={{ minHeight: '200px' }}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-gray-600">Loading report...</p>
                    </div>
                  </div>
                ) : reportData ? (
                  <div className="max-h-[500px] overflow-y-auto">
                    {renderReportDetails(selectedReport!, reportData)}
                  </div>
                ) : (
                  <div className="flex justify-center items-center" style={{ minHeight: '200px' }}>
                    <p className="text-sm text-gray-600">Select a report to view details</p>
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

