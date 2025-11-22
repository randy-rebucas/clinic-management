'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReferralForm from './ReferralForm';
// Radix UI components not used - using native HTML elements

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export default function ReferralFormClient({ patientId }: { patientId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [patientsRes, doctorsRes] = await Promise.all([
        fetch('/api/patients'),
        fetch('/api/doctors'),
      ]);

      if (patientsRes.status === 401 || doctorsRes.status === 401) {
        router.push('/login');
        return;
      }

      const patientsData = await patientsRes.json();
      const doctorsData = await doctorsRes.json();

      if (patientsData.success) {
        setPatients(patientsData.data);
      }
      if (doctorsData.success) {
        setDoctors(doctorsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push('/referrals');
      } else {
        alert(data.error || 'Failed to create referral');
      }
    } catch (error) {
      console.error('Failed to create referral:', error);
      alert('Failed to create referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/referrals');
  };

  if (loading) {
    return (
      <div className="w-full px-4 py-3">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-3 text-sm text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-3">
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={handleCancel}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">New Referral</h1>
          </div>
          <p className="text-gray-600 text-sm ml-8">Create a new patient referral</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          {submitting ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
                <p className="mt-3 text-sm text-gray-600">Creating referral...</p>
              </div>
            </div>
          ) : (
            <ReferralForm
              initialData={patientId ? { patient: patientId } : undefined}
              patients={patients}
              doctors={doctors}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

