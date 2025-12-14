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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-100 border-t-purple-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-purple-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
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
                <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Upload Document</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Upload and categorize a new document</p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {submitting ? (
              <div className="flex flex-col items-center gap-4 min-h-[200px] justify-center p-12">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-100 border-t-purple-600"></div>
                </div>
                <p className="text-sm text-gray-600 font-medium">Uploading document...</p>
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

