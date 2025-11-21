'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'accepted':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'declined':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'stat':
        return 'bg-red-100 text-red-800';
      case 'urgent':
        return 'bg-orange-100 text-orange-800';
      case 'routine':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading referrals...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-3">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Referrals</h1>
          <p className="text-gray-600 text-sm">Manage patient referrals</p>
        </div>
        <Link
          href="/referrals/new"
          className="px-3 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors inline-flex items-center"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Referral
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Referral Code
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Patient
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Referring Doctor
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Urgency
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {referrals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500 text-sm">
                  No referrals found
                </td>
              </tr>
            ) : (
              referrals.map((referral) => (
                <tr key={referral._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium text-gray-900">
                    {referral.referralCode}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-900">
                    {referral.patient?.firstName} {referral.patient?.lastName}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
                    {referral.type.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-900">
                    {referral.referringDoctor 
                      ? `${referral.referringDoctor.firstName} ${referral.referringDoctor.lastName}`
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getStatusColor(referral.status)}`}>
                      {referral.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full ${getUrgencyColor(referral.urgency)}`}>
                      {referral.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-500">
                    {new Date(referral.referredDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-sm font-medium">
                    <Link
                      href={`/referrals/${referral._id}`}
                      className="text-blue-600 hover:text-blue-900 text-xs"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

