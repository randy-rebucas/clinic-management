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

export default function VisitFormClient({ patientId }: { patientId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3 min-h-[256px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading form...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
              <p>{error}</p>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCancel}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold mb-1">New Clinical Visit</h1>
              <p className="text-sm text-gray-600">Create a new clinical visit record</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-3 p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600">Creating visit...</p>
              </div>
            ) : (
              <div className="p-6">
                <VisitForm
                  initialData={patientId ? { patient: patientId } : undefined}
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

