'use client';

import { Patient } from './types/PatientTypes';

interface QuickStatsPanelProps {
  showStats: boolean;
  patients: Patient[];
  filteredPatients: Patient[];
}

export default function QuickStatsPanel({
  showStats,
  patients,
  filteredPatients,
}: QuickStatsPanelProps) {
  const thisMonthCount = patients.filter((p) => {
    const created = new Date((p as any).createdAt || 0);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  const activeCount = patients.filter((p) => (p as any).active !== false).length;

  return (
    <div className={`grid transition-all duration-300 ease-in-out overflow-hidden ${showStats ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="overflow-hidden pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pb-4 border-b border-gray-100">
          {/* Total Patients */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Total Patients</p>
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-blue-700">{patients.length}</p>
          </div>

          {/* Showing */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Showing</p>
              <div className="p-2 bg-purple-500 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-purple-700">{filteredPatients.length}</p>
          </div>

          {/* This Month */}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg border border-emerald-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">This Month</p>
              <div className="p-2 bg-emerald-500 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-700">{thisMonthCount}</p>
          </div>

          {/* Active */}
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200 p-3 sm:p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Active</p>
              <div className="p-2 bg-amber-500 rounded-lg">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-amber-700">{activeCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
