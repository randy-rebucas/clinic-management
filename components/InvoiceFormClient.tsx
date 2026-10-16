'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import InvoiceForm from './InvoiceForm';
import { formatApiError } from './utils/apiError';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
  discountEligibility?: {
    pwd?: { eligible: boolean; idNumber?: string };
    senior?: { eligible: boolean; idNumber?: string };
    membership?: { eligible: boolean; membershipType?: string; discountPercentage?: number };
  };
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

interface Service {
  _id: string;
  name: string;
  code?: string;
  category?: string;
  unitPrice: number;
  unit?: string;
}

function withLinkedPatient(list: Patient[], linked: Patient | null) {
  if (!linked || list.some((p) => p._id === linked._id)) return list;
  return [linked, ...list];
}

export default function InvoiceFormClient({ 
  patientId, 
  visitId 
}: { 
  patientId?: string; 
  visitId?: string;
} = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [patientQuery, setPatientQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkedPatientRef = useRef<Patient | null>(null);
  const router = useRouter();

  // Server-side patient search (debounced); stale responses are aborted.
  useEffect(() => {
    if (patientQuery === null) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (patientQuery.trim()) params.set('search', patientQuery.trim());
        const res = await fetch(`/api/patients?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) setPatients(withLinkedPatient(data.data, linkedPatientRef.current));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error('Failed to search patients:', err);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [patientQuery]);

  const fetchData = useCallback(async () => {
    try {
      const [patientsRes, servicesRes, visitsRes] = await Promise.all([
        fetch('/api/patients?limit=20'),
        fetch('/api/services?active=true'),
        patientId ? fetch(`/api/visits?patientId=${patientId}`) : Promise.resolve(null),
      ]);

      if (patientsRes.status === 401 || servicesRes.status === 401) {
        router.push('/login');
        return;
      }

      const [patientsData, servicesData, visitsData] = await Promise.all([
        patientsRes.json(),
        servicesRes.json(),
        visitsRes ? visitsRes.json() : Promise.resolve({ success: true, data: [] }),
      ]);

      if (patientsData.success) {
        let list: Patient[] = Array.isArray(patientsData.data) ? patientsData.data : [];
        const linked = patientId ? list.find((p) => String(p._id) === String(patientId)) : undefined;
        if (patientId && !linked) {
          const linkedRes = await fetch(`/api/patients/${patientId}`);
          const linkedData = linkedRes.ok ? await linkedRes.json() : null;
          if (linkedData?.success && linkedData.data?._id) {
            linkedPatientRef.current = linkedData.data;
            list = [linkedData.data, ...list];
          }
        } else if (linked) {
          linkedPatientRef.current = linked;
        }
        setPatients(list);
      }
      if (servicesData.success) {
        setServices(servicesData.data);
      }
      if (visitsData.success) {
        setVisits(visitsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [patientId, router]);

  useEffect(() => {
    const load = async () => {
      await fetchData();
    };
    load();
  }, [fetchData]);

  const handleSubmit = async (formData: any) => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/invoices', {
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
        router.push('/invoices');
      } else {
        setError(formatApiError(data, 'Failed to create invoice'));
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      setError('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/invoices');
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-100 border-t-emerald-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-emerald-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-4">
              <button 
                type="button"
                onClick={handleCancel}
                aria-label="Back to invoices"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">New Invoice</h1>
                  <p className="text-sm sm:text-base text-gray-600 mt-1">Create a new invoice for billing</p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div role="alert" className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" aria-busy={submitting}>
            <InvoiceForm
              initialData={patientId ? { patient: patientId, visit: visitId } : undefined}
              patients={patients}
              visits={visits}
              services={services}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              submitting={submitting}
              onPatientSearch={setPatientQuery}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

