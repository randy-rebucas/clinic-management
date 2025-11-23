'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LabResultForm from './LabResultForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

export default function LabResultFormClient({ patientId }: { patientId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/patients');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPatients(data.data);
        if (patientId) {
          // Pre-select patient if patientId is provided
          const patient = data.data.find((p: Patient) => p._id === patientId);
          if (patient) {
            // This will be handled by the form component
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: {
    patient: string;
    testType: string;
    notes?: string;
    priority?: string;
    requestedBy?: string;
    [key: string]: unknown;
  }) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/lab-results', {
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
        router.push('/lab-results');
      } else {
        alert(data.error || 'Failed to create lab order');
      }
    } catch (error) {
      console.error('Failed to create lab order:', error);
      alert('Failed to create lab order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/lab-results');
  };

  if (loading) {
    return (
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '256px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p>Loading...</p>
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
              <h1 className="text-3xl font-bold mb-1">New Lab Order</h1>
              <p className="text-sm text-gray-600">Create a new laboratory test order</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '200px' }}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600">Creating lab order...</p>
              </div>
            ) : (
              <LabResultForm
                initialData={patientId ? { patient: patientId } : undefined}
                patients={patients}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

