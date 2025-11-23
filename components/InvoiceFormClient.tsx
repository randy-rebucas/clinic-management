'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import InvoiceForm from './InvoiceForm';

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
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, [patientId, visitId]);

  const fetchData = async () => {
    try {
      const [patientsRes, servicesRes, visitsRes] = await Promise.all([
        fetch('/api/patients'),
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
        setPatients(patientsData.data);
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
  };

  const handleSubmit = async (formData: any) => {
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
        alert(data.error || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/invoices');
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
              <h1 className="text-3xl font-bold mb-1">New Invoice</h1>
              <p className="text-sm text-gray-600">Create a new invoice for billing</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: '200px' }}>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600">Creating invoice...</p>
              </div>
            ) : (
              <InvoiceForm
                initialData={patientId ? { patient: patientId, visit: visitId } : undefined}
                patients={patients}
                visits={visits}
                services={services}
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

