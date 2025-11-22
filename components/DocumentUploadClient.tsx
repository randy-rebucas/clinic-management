'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DocumentUploadForm from './DocumentUploadForm';
// Radix UI components not used - using native HTML elements

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
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-0.5">
            <button
              onClick={handleCancel}
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Upload Document</h1>
          </div>
          <p className="text-gray-600 text-xs ml-7">Upload and categorize a new document</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-3">
          {submitting ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-blue-600"></div>
                <p className="mt-3 text-sm text-gray-600">Uploading document...</p>
              </div>
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
  );
}

