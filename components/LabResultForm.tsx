'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
      setSelectedPatient(null);
      setPatientSearch('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="flex flex-col gap-3 p-4">
          {/* Patient Selection */}
          <div>
            <Label htmlFor="patientSearch">Patient <span className="text-red-500">*</span></Label>
            <div className="relative patient-search-container">
              <Input
                id="patientSearch"
                type="text"
                required
                value={patientSearch}
                onChange={e => {
                  setPatientSearch(e.target.value);
                  setShowPatientSearch(true);
                  if (!e.target.value) {
                    setFormData({ ...formData, patient: '' });
                    setSelectedPatient(null);
                  }
                }}
                onFocus={() => setShowPatientSearch(true)}
                placeholder="Type to search patients..."
                style={{ all: 'unset', width: '100%' }}
              />
          {showPatientSearch && filteredPatients.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors flex flex-col items-start"
                  >
                    <span className="font-medium text-xs">{patient.firstName} {patient.lastName}</span>
                    <span className="text-xs text-gray-500">
                      {patient.patientCode && `${patient.patientCode}`}
                      {age && ` • Age: ${age} years`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg p-2">
              <span className="text-xs text-gray-500">No patients found</span>
            </div>
          )}
        </div>
        {formData.patient && !selectedPatient && (
          <p className="text-xs text-red-500 mt-1">Please select a valid patient from the list</p>
        )}
      </div>

          {/* Test Type */}
          <div>
            <Label htmlFor="testType">Test Type <span className="text-red-500">*</span></Label>
            <Input
              id="testType"
              type="text"
              required
              value={formData.request.testType}
              onChange={e => setFormData({
                ...formData,
                request: { ...formData.request, testType: e.target.value }
              })}
              placeholder="e.g., CBC, Urinalysis, Blood Glucose"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Test Code (Optional) */}
          <div>
            <Label htmlFor="testCode">Test Code (Optional)</Label>
            <Input
              id="testCode"
              type="text"
              value={formData.request.testCode}
              onChange={e => setFormData({
                ...formData,
                request: { ...formData.request, testCode: e.target.value }
              })}
              placeholder="e.g., LOINC code"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description (Optional)</Label>
            <Input
              id="description"
              as="textarea"
              value={formData.request.description}
              onChange={e => setFormData({
                ...formData,
                request: { ...formData.request, description: e.target.value }
              })}
              placeholder="Additional test description or notes"
              style={{ all: 'unset', width: '100%' }}
              rows={2}
            />
          </div>

          {/* Urgency */}
          <div>
            <Label htmlFor="urgency">Urgency <span className="text-red-500">*</span></Label>
            <Select value={formData.request.urgency} onValueChange={value => setFormData({
              ...formData,
              request: { ...formData.request, urgency: value as 'routine' | 'urgent' | 'stat' }
            })}>
              <SelectItem value="routine">Routine</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="stat">STAT</SelectItem>
            </Select>
          </div>

      {/* Fasting Required */}
      <div className="flex items-center gap-2">
        <Input
          type="checkbox"
          id="fastingRequired"
          checked={formData.request.fastingRequired}
          onChange={e => setFormData({
            ...formData,
            request: { ...formData.request, fastingRequired: e.target.checked }
          })}
          style={{ width: '1.25rem', height: '1.25rem' }}
        />
        <Label htmlFor="fastingRequired" className="text-xs cursor-pointer">
          Fasting Required
        </Label>
      </div>

          {/* Special Instructions */}
          <div>
            <Label htmlFor="specialInstructions">Special Instructions (Optional)</Label>
            <Input
              id="specialInstructions"
              as="textarea"
              value={formData.request.specialInstructions}
              onChange={e => setFormData({
                ...formData,
                request: { ...formData.request, specialInstructions: e.target.value }
              })}
              placeholder="Any special instructions for the lab"
              style={{ all: 'unset', width: '100%' }}
              rows={2}
            />
          </div>

          {/* Preparation Notes */}
          <div>
            <label className="block text-xs font-medium mb-2">Preparation Notes (Optional)</label>
            <textarea
              value={formData.request.preparationNotes}
              onChange={(e) => setFormData({
                ...formData,
                request: { ...formData.request, preparationNotes: e.target.value }
              })}
              placeholder="Patient preparation instructions"
              rows={2}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
            <div>
              <Label htmlFor="preparationNotes">Preparation Notes (Optional)</Label>
              <Input
                id="preparationNotes"
                as="textarea"
                value={formData.request.preparationNotes}
                onChange={e => setFormData({
                  ...formData,
                  request: { ...formData.request, preparationNotes: e.target.value }
                })}
                placeholder="Preparation notes for the patient"
                style={{ all: 'unset', width: '100%' }}
                rows={2}
              />
            </div>
              </button>
            )}
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
            >
              Create Lab Order
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

