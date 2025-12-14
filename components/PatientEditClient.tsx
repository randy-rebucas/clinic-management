'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PatientForm from './PatientForm';

interface Patient {
  _id: string;
  patientCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  identifiers?: {
    philHealth?: string;
    govId?: string;
  };
  medicalHistory?: string;
  preExistingConditions?: Array<{
    condition: string;
    diagnosisDate?: string;
    status: 'active' | 'resolved' | 'chronic';
    notes?: string;
  }>;
  allergies?: Array<string | {
    substance: string;
    reaction: string;
    severity: string;
  }>;
  familyHistory?: Record<string, string>;
}

export default function PatientEditClient({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchPatient();
  }, [patientId]);

  const fetchPatient = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/patients/${patientId}`);
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        let errorData;
        if (contentType && contentType.includes('application/json')) {
          errorData = await res.json();
        }
        const errorMsg = errorData?.error || `Failed to load patient: ${res.status} ${res.statusText}`;
        setError(errorMsg);
        return;
      }
      
      const data = await res.json();
      if (data.success && data.data) {
        setPatient(data.data);
      } else {
        setError(data.error || 'Failed to load patient');
      }
    } catch (error) {
      console.error('Failed to fetch patient:', error);
      setError('Failed to load patient. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    setError(null);
    
    try {
      // Handle allergies - already in structured format from form
      const allergiesArray = Array.isArray(formData.allergies)
        ? formData.allergies
        : formData.allergies
            ?.split(',')
            .map((a: string) => a.trim())
            .filter((a: string) => a.length > 0)
            .map((substance: string) => ({ substance, reaction: '', severity: 'unknown' })) || [];

      // Clean up identifiers - only include if they have values
      const identifiers = formData.identifiers
        ? {
            ...(formData.identifiers.philHealth?.trim() && { philHealth: formData.identifiers.philHealth.trim() }),
            ...(formData.identifiers.govId?.trim() && { govId: formData.identifiers.govId.trim() }),
          }
        : undefined;

      // Only include identifiers if it has at least one property
      const cleanedIdentifiers = identifiers && Object.keys(identifiers).length > 0 ? identifiers : undefined;

      // Prepare the payload
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        dateOfBirth: new Date(formData.dateOfBirth),
        address: {
          street: formData.address.street,
          city: formData.address.city,
          state: formData.address.state,
          zipCode: formData.address.zipCode,
        },
        emergencyContact: {
          name: formData.emergencyContact.name,
          phone: formData.emergencyContact.phone,
          relationship: formData.emergencyContact.relationship,
        },
        allergies: allergiesArray,
      };

      // Add optional fields only if they have values
      if (formData.middleName?.trim()) payload.middleName = formData.middleName.trim();
      if (formData.suffix?.trim()) payload.suffix = formData.suffix.trim();
      if (formData.sex && formData.sex !== 'unknown') payload.sex = formData.sex;
      if (formData.civilStatus?.trim()) payload.civilStatus = formData.civilStatus.trim();
      if (formData.nationality?.trim()) payload.nationality = formData.nationality.trim();
      if (formData.occupation?.trim()) payload.occupation = formData.occupation.trim();
      if (formData.medicalHistory?.trim()) payload.medicalHistory = formData.medicalHistory.trim();
      if (cleanedIdentifiers) payload.identifiers = cleanedIdentifiers;

      // Add pre-existing conditions if any
      if (formData.preExistingConditions && formData.preExistingConditions.length > 0) {
        const filteredConditions = formData.preExistingConditions.filter(
          (c: any) => c.condition && c.condition.trim().length > 0
        );
        if (filteredConditions.length > 0) {
          payload.preExistingConditions = filteredConditions;
        }
      }

      // Add family history if any
      if (formData.familyHistory && Object.keys(formData.familyHistory).length > 0) {
        const filteredFamilyHistory = Object.fromEntries(
          Object.entries(formData.familyHistory).filter(([condition, relation]) => condition.trim().length > 0)
        );
        if (Object.keys(filteredFamilyHistory).length > 0) {
          payload.familyHistory = filteredFamilyHistory;
        }
      }

      const res = await fetch(`/api/patients/${patientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Check for authentication errors
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
        setError(`Failed to update patient: API error (Status: ${res.status})`);
        return;
      }
      
      if (data.success) {
        // Redirect to the patient's detail page
        router.push(`/patients/${patientId}`);
      } else {
        console.error('API error response:', data);
        setError('Error: ' + (data.error || 'Unknown error occurred'));
      }
    } catch (error: any) {
      console.error('Failed to update patient:', error);
      setError(`Failed to update patient: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/patients/${patientId}`);
  };

  if (loading) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-4">
            <div className="h-16 w-[300px] bg-gray-200 rounded-xl animate-pulse"></div>
            <div className="h-[400px] bg-gray-200 rounded-xl animate-pulse"></div>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-800 mb-2">Error</h3>
                <p className="text-sm text-red-700 mb-4">{error}</p>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-semibold"
                >
                  ← Back to Patient
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!patient) {
    return (
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '50vh' }}>
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Patient not found</h2>
            <Link
              href="/patients"
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md"
            >
              Back to Patients
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Format date of birth for input field (YYYY-MM-DD)
  const formattedDateOfBirth = patient.dateOfBirth 
    ? new Date(patient.dateOfBirth).toISOString().split('T')[0]
    : '';

  // Convert allergies to form format
  const formattedAllergies = patient.allergies?.map((allergy) => {
    if (typeof allergy === 'string') {
      return { substance: allergy, reaction: '', severity: 'unknown' };
    }
    return allergy;
  }) || [];

  // Prepare initial data for the form
  const initialData = {
    firstName: patient.firstName,
    middleName: patient.middleName || '',
    lastName: patient.lastName,
    suffix: patient.suffix || '',
    email: patient.email,
    phone: patient.phone,
    dateOfBirth: formattedDateOfBirth,
    sex: patient.sex as 'male' | 'female' | 'other' | 'unknown' | undefined,
    civilStatus: patient.civilStatus || '',
    nationality: patient.nationality || '',
    occupation: patient.occupation || '',
    address: {
      street: patient.address?.street || '',
      city: patient.address?.city || '',
      state: patient.address?.state || '',
      zipCode: patient.address?.zipCode || '',
    },
    emergencyContact: {
      name: patient.emergencyContact?.name || '',
      phone: patient.emergencyContact?.phone || '',
      relationship: patient.emergencyContact?.relationship || '',
    },
    identifiers: patient.identifiers || {},
    medicalHistory: patient.medicalHistory || '',
    preExistingConditions: patient.preExistingConditions || [],
    allergies: formattedAllergies,
    familyHistory: patient.familyHistory || {},
  };

  const fullName = [patient.firstName, patient.middleName, patient.lastName, patient.suffix]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Link
                href={`/patients/${patientId}`}
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 mt-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Edit Patient</h1>
                    <p className="text-sm sm:text-base text-gray-600 mt-1">{fullName}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

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

          {/* Form Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {submitting ? (
              <div className="flex flex-col items-center justify-center gap-4 p-12" style={{ minHeight: '300px' }}>
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-blue-600"></div>
                </div>
                <p className="text-gray-600 font-medium">Updating patient...</p>
              </div>
            ) : (
              <div className="p-6 sm:p-8">
                <PatientForm
                  initialData={initialData}
                  onSubmit={handleSubmit}
                  onCancel={handleCancel}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

