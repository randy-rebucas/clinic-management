'use client';

import { useState, useEffect, FormEvent } from 'react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

interface LabResultFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
    request?: {
      testType?: string;
      testCode?: string;
      description?: string;
      urgency?: 'routine' | 'urgent' | 'stat';
      specialInstructions?: string;
      fastingRequired?: boolean;
      preparationNotes?: string;
    };
  };
  patients: Patient[];
  onSubmit: (data: any) => void;
  onCancel?: () => void;
}

export default function LabResultForm({
  initialData,
  patients,
  onSubmit,
  onCancel,
}: LabResultFormProps) {
  const [formData, setFormData] = useState({
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    request: {
      testType: initialData?.request?.testType || '',
      testCode: initialData?.request?.testCode || '',
      description: initialData?.request?.description || '',
      urgency: initialData?.request?.urgency || 'routine' as 'routine' | 'urgent' | 'stat',
      specialInstructions: initialData?.request?.specialInstructions || '',
      fastingRequired: initialData?.request?.fastingRequired || false,
      preparationNotes: initialData?.request?.preparationNotes || '',
    },
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}`);
      }
    }
  }, [formData.patient, patients]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
      }
    };

    if (showPatientSearch) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPatientSearch]);

  const filteredPatients = patients.filter((patient) => {
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    const patientCode = (patient.patientCode || '').toLowerCase();
    return fullName.includes(searchLower) || patientCode.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      alert('Please select a valid patient');
      setShowPatientSearch(true);
      return;
    }
    if (!formData.request.testType) {
      alert('Please enter a test type');
      return;
    }

    const submitData = {
      patient: formData.patient,
      visit: formData.visit || undefined,
      request: {
        testType: formData.request.testType,
        testCode: formData.request.testCode || undefined,
        description: formData.request.description || undefined,
        urgency: formData.request.urgency,
        specialInstructions: formData.request.specialInstructions || undefined,
        fastingRequired: formData.request.fastingRequired,
        preparationNotes: formData.request.preparationNotes || undefined,
      },
      status: 'ordered',
    };

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[80vh] overflow-y-auto">
      {/* Patient Selection */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Patient *</label>
        <div className="relative patient-search-container">
          <input
            type="text"
            required
            value={patientSearch}
            onChange={(e) => {
              setPatientSearch(e.target.value);
              setShowPatientSearch(true);
              if (!e.target.value) {
                setFormData({ ...formData, patient: '' });
                setSelectedPatient(null);
              }
            }}
            onFocus={() => setShowPatientSearch(true)}
            placeholder="Type to search patients..."
            className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {showPatientSearch && filteredPatients.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
              {filteredPatients.map((patient) => {
                const age = patient.dateOfBirth
                  ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                  : null;
                return (
                  <button
                    key={patient._id}
                    type="button"
                    onClick={() => selectPatient(patient)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                  >
                    <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                    <div className="text-xs text-gray-500">
                      {patient.patientCode && `${patient.patientCode}`}
                      {age && ` • Age: ${age} years`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg">
              <div className="px-3 py-2 text-sm text-gray-500">No patients found</div>
            </div>
          )}
        </div>
        {formData.patient && !selectedPatient && (
          <p className="mt-0.5 text-xs text-red-600">Please select a valid patient from the list</p>
        )}
      </div>

      {/* Test Type */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Test Type *</label>
        <input
          type="text"
          required
          value={formData.request.testType}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, testType: e.target.value }
          })}
          placeholder="e.g., CBC, Urinalysis, Blood Glucose"
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Test Code (Optional) */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Test Code (Optional)</label>
        <input
          type="text"
          value={formData.request.testCode}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, testCode: e.target.value }
          })}
          placeholder="e.g., LOINC code"
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description (Optional)</label>
        <textarea
          value={formData.request.description}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, description: e.target.value }
          })}
          placeholder="Additional test description or notes"
          rows={2}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Urgency */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Urgency *</label>
        <select
          required
          value={formData.request.urgency}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, urgency: e.target.value as 'routine' | 'urgent' | 'stat' }
          })}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="routine">Routine</option>
          <option value="urgent">Urgent</option>
          <option value="stat">STAT</option>
        </select>
      </div>

      {/* Fasting Required */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="fastingRequired"
          checked={formData.request.fastingRequired}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, fastingRequired: e.target.checked }
          })}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="fastingRequired" className="ml-2 block text-xs text-gray-700">
          Fasting Required
        </label>
      </div>

      {/* Special Instructions */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Special Instructions (Optional)</label>
        <textarea
          value={formData.request.specialInstructions}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, specialInstructions: e.target.value }
          })}
          placeholder="Any special instructions for the lab"
          rows={2}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Preparation Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Preparation Notes (Optional)</label>
        <textarea
          value={formData.request.preparationNotes}
          onChange={(e) => setFormData({
            ...formData,
            request: { ...formData.request, preparationNotes: e.target.value }
          })}
          placeholder="Patient preparation instructions"
          rows={2}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Create Lab Order
        </button>
      </div>
    </form>
  );
}

