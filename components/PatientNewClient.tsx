'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PatientForm from './PatientForm';

export default function PatientNewClient() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

      const res = await fetch('/api/patients', {
        method: 'POST',
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
        setError(`Failed to create patient: API error (Status: ${res.status})`);
        return;
      }
      
      if (data.success) {
        // Redirect to the new patient's detail page
        router.push(`/patients/${data.data._id}`);
      } else {
        console.error('API error response:', data);
        setError('Error: ' + (data.error || 'Unknown error occurred'));
      }
    } catch (error: any) {
      console.error('Failed to create patient:', error);
      setError(`Failed to create patient: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/patients');
  };

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <Link
                href="/patients"
                className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 mt-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">New Patient</h1>
                    <p className="text-sm sm:text-base text-gray-600 mt-1">Add a new patient to the system</p>
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
                <p className="text-gray-600 font-medium">Creating patient...</p>
              </div>
            ) : (
              <div className="p-6 sm:p-8">
                <PatientForm
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

