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

  // Sync selected patient when formData.patient changes
  useEffect(() => {
    if (formData.patient) {
      const patient = patients.find((p) => p._id === formData.patient);
      // Using setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setSelectedPatient(patient || null);
        if (patient) {
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
      }, 0);
      return () => clearTimeout(timer);
    } else {
      setTimeout(() => {
        setSelectedPatient(null);
        setPatientSearch('');
      }, 0);
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
    <form onSubmit={handleSubmit}>
      <div className="max-h-[80vh] overflow-y-auto">
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Patient Selection */}
          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <label className="block text-sm font-bold text-gray-900">
                Patient <span className="text-red-600">*</span>
              </label>
            </div>
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm"
              />
              {showPatientSearch && filteredPatients.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredPatients.map((patient) => {
                    const age = patient.dateOfBirth
                      ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    return (
                      <button
                        key={patient._id}
                        type="button"
                        onClick={() => {
                          selectPatient(patient);
                          setShowPatientSearch(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-cyan-50 rounded transition-colors flex flex-col items-start"
                      >
                        <span className="font-semibold text-sm text-gray-900">{patient.firstName} {patient.lastName}</span>
                        <span className="text-xs text-gray-600">
                          {patient.patientCode && `${patient.patientCode}`}
                          {age && ` • Age: ${age} years`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl p-2">
                  <span className="text-xs text-gray-500">No patients found</span>
                </div>
              )}
            </div>
            {formData.patient && !selectedPatient && (
              <p className="text-xs text-red-600 mt-2 font-medium">Please select a valid patient from the list</p>
            )}
          </div>

          {/* Test Information */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Test Information</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Test Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Test Type <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.request.testType}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, testType: e.target.value }
                  })}
                  placeholder="e.g., CBC, Urinalysis, Blood Glucose"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              {/* Test Code (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Test Code (Optional)</label>
                <input
                  type="text"
                  value={formData.request.testCode}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, testCode: e.target.value }
                  })}
                  placeholder="e.g., LOINC code"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Description (Optional)</label>
                <textarea
                  value={formData.request.description}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, description: e.target.value }
                  })}
                  placeholder="Additional test description or notes"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                />
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Urgency <span className="text-red-600">*</span>
                </label>
                <select
                  value={formData.request.urgency}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, urgency: e.target.value as 'routine' | 'urgent' | 'stat' }
                  })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="stat">STAT</option>
                </select>
              </div>

              {/* Fasting Required */}
              <div className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-gray-200">
                <input
                  type="checkbox"
                  id="fastingRequired"
                  checked={formData.request.fastingRequired}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, fastingRequired: e.target.checked }
                  })}
                  className="w-4 h-4 text-cyan-600 border-gray-300 rounded focus:ring-cyan-500"
                />
                <label htmlFor="fastingRequired" className="text-sm font-semibold text-gray-700 cursor-pointer">
                  Fasting Required
                </label>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-gray-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Instructions & Notes</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Special Instructions */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Special Instructions (Optional)</label>
                <textarea
                  value={formData.request.specialInstructions}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, specialInstructions: e.target.value }
                  })}
                  placeholder="Any special instructions for the lab"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                />
              </div>

              {/* Preparation Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Preparation Notes (Optional)</label>
                <textarea
                  value={formData.request.preparationNotes}
                  onChange={(e) => setFormData({
                    ...formData,
                    request: { ...formData.request, preparationNotes: e.target.value }
                  })}
                  placeholder="Patient preparation instructions"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none resize-y transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors border border-gray-200 text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white rounded-lg font-semibold transition-all shadow-md text-sm"
            >
              Create Lab Order
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

