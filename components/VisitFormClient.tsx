'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import VisitForm from './VisitForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  patientCode?: string;
}

interface QueueVitals {
  bp?: string;
  hr?: number;
  rr?: number;
  tempC?: number;
  spo2?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
}

export default function VisitFormClient({ patientId, queueId }: { patientId?: string; queueId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [queueVitals, setQueueVitals] = useState<QueueVitals | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    if (queueId) {
      fetchQueueVitals();
    }
  }, [queueId]);

  const fetchData = async () => {
    try {
      const [patientsRes, userRes] = await Promise.all([
        fetch('/api/patients'),
        fetch('/api/user/me'),
      ]);

      if (patientsRes.status === 401 || userRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false };
      };

      const patientsData = await parseResponse(patientsRes);
      const userData = await parseResponse(userRes);

      if (patientsData.success) setPatients(patientsData.data);
      if (userData.success && userData.data) {
        setProviderName(userData.data.name || 'Dr. Provider');
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Failed to load form data');
    } finally {
      setLoading(false);
    }
  };

  const fetchQueueVitals = async () => {
    try {
      const res = await fetch(`/api/queue/${queueId}`);

      if (res.status === 401) {
        router.push('/login');
        return;
      }
      console.log('Fetching queue vitals for queueId:', queueId, 'Response:', res);
      const data = await res.json();
      console.log('Queue vitals data:', data);
      if (data.success && data.data.vitals) {
        console.log('Queue vitals found:', data.data.vitals);
        // Map queue vitals to visit vitals format
        setQueueVitals({
          bp: data.data.vitals.bp,
          hr: data.data.vitals.hr,
          rr: data.data.vitals.rr,
          tempC: data.data.vitals.tempC,
          spo2: data.data.vitals.spo2,
          heightCm: data.data.vitals.heightCm,
          weightKg: data.data.vitals.weightKg,
          bmi: data.data.vitals.bmi,
        });
      }
    } catch (error) {
      console.error('Failed to fetch queue vitals:', error);
      setError('Failed to load queue vitals');
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      setSubmitting(true);
      setError(null);

      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: new Date(),
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
        }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        setError('Failed to create visit: API error');
        return;
      }

      if (data.success) {
        router.push('/visits?success=true');
      } else {
        setError('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Failed to create visit:', error);
      setError('Failed to create visit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/visits');
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-100 border-t-blue-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading form...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <button
                onClick={handleCancel}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">New Clinical Visit</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Create a new clinical visit record</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-4 p-12">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-100 border-t-teal-600"></div>
                <p className="text-sm text-gray-600 font-medium">Creating visit...</p>
              </div>
            ) : (
              <div className="p-6 sm:p-8">
                <VisitForm
                  initialData={{
                    ...(patientId ? { patient: patientId } : {}),
                    ...(queueVitals ? { vitals: queueVitals } : {}),
                  }}
                  patients={patients}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                  providerName={providerName}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

