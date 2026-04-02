'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientForm from './PatientForm';
import SubPageHeader from './SubPageHeader';
import AlertBanner from './sharable/AlertBanner';

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

      // Send the request to create a new patient
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

      if (data && data.success && data.data && data.data._id) {
        // Redirect to the new patient's detail page
        router.push(`/patients/${data.data._id}`);
      } else {
        // Defensive: handle empty or unexpected API response
        console.error('API error response:', data);
        let errorMsg = 'Unknown error occurred';
        if (data && typeof data === 'object') {
          if (data.error) errorMsg = data.error;
          else if (data.message) errorMsg = data.message;
        } else if (typeof data === 'string') {
          errorMsg = data;
        }
        setError('Error: ' + errorMsg);
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
          <SubPageHeader
            backHref="/patients"
            iconPath="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
            title="New Patient"
            subtitle="Add a new patient to the system"
          />

          {error && <AlertBanner type="error" message={error} title="Error" />}

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
