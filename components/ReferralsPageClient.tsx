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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading referrals...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Referrals</h1>
              <p className="text-sm text-gray-600">Manage patient referrals</p>
            </div>
            <Link 
              href="/referrals/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Referral
            </Link>
          </div>

          {/* Search and Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Search by patient name, referral code, or referring doctor..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="min-w-[180px]">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="accepted">Accepted</option>
                    <option value="completed">Completed</option>
                    <option value="declined">Declined</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="min-w-[180px]">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
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
                    className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Referrals Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xl font-semibold">Referrals</h2>
                <p className="text-sm text-gray-600">
                  {filteredReferrals.length} {filteredReferrals.length === 1 ? 'referral' : 'referrals'}
                </p>
              </div>
              {filteredReferrals.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="mb-3">
                    <svg className="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-1">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'No referrals match your filters' : 'No referrals found'}
                  </h3>
                  <div className="text-sm text-gray-600 mb-3">
                    {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'Try adjusting your search or filters' : 'Create your first referral to get started'}
                  </div>
                  {!searchQuery && filterStatus === 'all' && filterType === 'all' && (
                    <Link 
                      href="/referrals/new"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New Referral
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Referral Code</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Patient</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Type</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Referring Doctor</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Status</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Urgency</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Date</th>
                        <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReferrals.map((referral) => (
                        <tr key={referral._id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <p className="text-sm font-medium">{referral.referralCode}</p>
                          </td>
                          <td className="py-2 px-3">
                            {referral.patient?._id ? (
                              <Link href={`/patients/${referral.patient._id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                                {referral.patient.firstName} {referral.patient.lastName}
                              </Link>
                            ) : (
                              <p className="text-sm">
                                {referral.patient?.firstName} {referral.patient?.lastName}
                              </p>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <p className="text-sm text-gray-600 capitalize">
                              {referral.type.replace('_', ' ')}
                            </p>
                          </td>
                          <td className="py-2 px-3">
                            {referral.referringDoctor ? (
                              <p className="text-sm">
                                {referral.referringDoctor.firstName} {referral.referringDoctor.lastName}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-600">N/A</p>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeColorClasses(getStatusColor(referral.status))}`}>
                              {referral.status}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getBadgeColorClasses(getUrgencyColor(referral.urgency))}`}>
                              {referral.urgency}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <p className="text-sm text-gray-600">
                              {new Date(referral.referredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <Link 
                              href={`/referrals/${referral._id}`}
                              className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors text-xs font-medium"
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
