'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DocumentUploadForm from './DocumentUploadForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

export default function DocumentUploadClient({ 
  patientId, 
  visitId 
}: { 
  patientId?: string; 
  visitId?: string;
} = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, [patientId, visitId]);

  const fetchData = async () => {
    try {
      const [patientsRes, visitsRes] = await Promise.all([
        fetch('/api/patients'),
        patientId ? fetch(`/api/visits?patientId=${patientId}`) : Promise.resolve(null),
      ]);

      if (patientsRes.status === 401) {
        router.push('/login');
        return;
      }

      const [patientsData, visitsData] = await Promise.all([
        patientsRes.json(),
        visitsRes ? visitsRes.json() : Promise.resolve({ success: true, data: [] }),
      ]);

      if (patientsData.success) {
        setPatients(patientsData.data);
      }
      if (visitsData.success) {
        setVisits(visitsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: FormData) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push('/documents');
      } else {
        alert(data.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('Failed to upload document. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/documents');
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
              <h1 className="text-3xl font-bold mb-1">Upload Document</h1>
              <p className="text-sm text-gray-600">Upload and categorize a new document</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '200px' }}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600">Uploading document...</p>
              </div>
            ) : (
              <DocumentUploadForm
                initialData={patientId ? { patient: patientId, visit: visitId } : undefined}
                patients={patients}
                visits={visits}
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

