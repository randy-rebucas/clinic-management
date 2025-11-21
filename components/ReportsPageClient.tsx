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
        setDashboardData(data.data || {});
      } else {
        console.error('Failed to fetch reports:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
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
                {dashboardData.totalConsultations || 0}
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
                ₱{dashboardData.totalIncome?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
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
          <h2 className="text-base font-semibold text-gray-900 mb-2">Available Reports</h2>
          <div className="space-y-2">
            <a href="/api/reports/consultations" className="block p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Consultations Report</div>
              <div className="text-xs text-gray-500">View consultation statistics</div>
            </a>
            <a href="/api/reports/income" className="block p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Income Report</div>
              <div className="text-xs text-gray-500">Financial performance analysis</div>
            </a>
            <a href="/api/reports/demographics" className="block p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Demographics Report</div>
              <div className="text-xs text-gray-500">Patient demographics analysis</div>
            </a>
            <a href="/api/reports/inventory" className="block p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Inventory Report</div>
              <div className="text-xs text-gray-500">Inventory status and usage</div>
            </a>
            <a href="/api/reports/hmo-claims" className="block p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">HMO Claims Report</div>
              <div className="text-xs text-gray-500">HMO claims and reimbursements</div>
            </a>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
          <h2 className="text-base font-semibold text-gray-900 mb-2">Quick Actions</h2>
          <div className="space-y-2">
            <button className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Export All Reports</div>
              <div className="text-xs text-gray-500">Download comprehensive report package</div>
            </button>
            <button className="w-full text-left p-2 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">
              <div className="font-medium text-sm text-gray-900">Schedule Report</div>
              <div className="text-xs text-gray-500">Set up automated report generation</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

