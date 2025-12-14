'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from './ui/Modal';

interface Referral {
  _id: string;
  referralCode: string;
  type: 'doctor_to_doctor' | 'patient_to_patient' | 'external';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  referringDoctor?: {
    firstName: string;
    lastName: string;
  };
  receivingDoctor?: {
    firstName: string;
    lastName: string;
  };
  status: 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled';
  referredDate: string;
  urgency: 'routine' | 'urgent' | 'stat';
}

export default function ReferralsPageClient() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchReferrals();
  }, []);

  const fetchReferrals = async () => {
    try {
      const res = await fetch('/api/referrals');
      
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
        setReferrals(data.data);
      } else {
        console.error('Failed to fetch referrals:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch referrals:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'accepted':
        return 'blue';
      case 'pending':
        return 'yellow';
      case 'declined':
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getUrgencyColor = (urgency: string): 'red' | 'orange' | 'gray' => {
    switch (urgency) {
      case 'stat':
        return 'red';
      case 'urgent':
        return 'orange';
      case 'routine':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const filteredReferrals = referrals.filter(referral => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${referral.patient?.firstName || ''} ${referral.patient?.lastName || ''}`.toLowerCase();
      const referralCode = (referral.referralCode || '').toLowerCase();
      const referringDoctor = referral.referringDoctor 
        ? `${referral.referringDoctor.firstName} ${referral.referringDoctor.lastName}`.toLowerCase()
        : '';
      if (!patientName.includes(query) && !referralCode.includes(query) && !referringDoctor.includes(query)) return false;
    }
    if (filterStatus !== 'all' && referral.status !== filterStatus) return false;
    if (filterType !== 'all' && referral.type !== filterType) return false;
    return true;
  });

  const getBadgeColorClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      green: 'bg-green-100 text-green-800 border-green-200',
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      orange: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colorMap[color] || colorMap.gray;
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-orange-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-100 border-t-orange-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading referrals...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-orange-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Referrals</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Manage patient referrals</p>
                </div>
              </div>
              <Link 
                href="/referrals/new"
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Referral
              </Link>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 transform -translate-y-1/2 p-1.5">
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      placeholder="Search by patient name, referral code, or referring doctor..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="min-w-[200px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="doctor_to_doctor">Doctor to Doctor</option>
                    <option value="patient_to_patient">Patient to Patient</option>
                    <option value="external">External</option>
                  </select>
                </div>
                {(searchQuery || filterStatus !== 'all' || filterType !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                      setFilterType('all');
                    }}
                    className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Referrals Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-500 rounded-lg">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Referrals</h2>
                </div>
                <p className="text-sm font-semibold text-gray-600">
                  {filteredReferrals.length} {filteredReferrals.length === 1 ? 'referral' : 'referrals'}
                </p>
              </div>
            </div>
            <div className="p-5">
              {filteredReferrals.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'No referrals match your filters' : 'No referrals found'}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'Try adjusting your search or filters' : 'Create your first referral to get started'}
                  </p>
                  {!searchQuery && filterStatus === 'all' && filterType === 'all' && (
                    <Link 
                      href="/referrals/new"
                      className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all flex items-center gap-2 mx-auto text-sm font-semibold shadow-md"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Referral
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Referral Code</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Patient</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Type</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Referring Doctor</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Urgency</th>
                        <th className="px-5 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                        <th className="px-5 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredReferrals.map((referral) => (
                        <tr key={referral._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold text-gray-900">{referral.referralCode}</p>
                          </td>
                          <td className="px-5 py-4">
                            {referral.patient?._id ? (
                              <Link href={`/patients/${referral.patient._id}`} className="text-sm font-bold text-orange-600 hover:text-orange-700 hover:underline transition-colors">
                                {referral.patient.firstName} {referral.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm font-medium text-gray-900">
                                {referral.patient?.firstName} {referral.patient?.lastName}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-600 capitalize">
                              {referral.type.replace('_', ' ')}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            {referral.referringDoctor ? (
                              <p className="text-sm font-medium text-gray-900">
                                {referral.referringDoctor.firstName} {referral.referringDoctor.lastName}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-500 font-medium">N/A</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColorClasses(getStatusColor(referral.status))}`}>
                              {referral.status}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeColorClasses(getUrgencyColor(referral.urgency))}`}>
                              {referral.urgency}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(referral.referredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link 
                              href={`/referrals/${referral._id}`}
                              className="inline-flex items-center px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-xs font-semibold border border-orange-200"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
