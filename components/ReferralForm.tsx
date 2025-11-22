'use client';

import { useState, useEffect, FormEvent } from 'react';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

interface ReferralFormProps {
  initialData?: {
    patient?: string;
  };
  patients: Patient[];
  doctors: Doctor[];
  onSubmit: (data: any) => void;
  onCancel?: () => void;
}

export default function ReferralForm({
  initialData,
  patients,
  doctors,
  onSubmit,
  onCancel,
}: ReferralFormProps) {
  const [formData, setFormData] = useState({
    type: 'doctor_to_doctor' as 'doctor_to_doctor' | 'patient_to_patient' | 'external',
    patient: initialData?.patient || '',
    referringDoctor: '',
    receivingDoctor: '',
    referringClinic: '',
    referringContact: {
      name: '',
      phone: '',
      email: '',
    },
    receivingClinic: '',
    reason: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'stat',
    specialty: '',
    notes: '',
    chiefComplaint: '',
    diagnosis: '',
    relevantHistory: '',
    medications: [] as string[],
    followUpRequired: false,
    followUpDate: '',
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [medicationInput, setMedicationInput] = useState('');

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

  const addMedication = () => {
    if (medicationInput.trim()) {
      setFormData({
        ...formData,
        medications: [...formData.medications, medicationInput.trim()],
      });
      setMedicationInput('');
    }
  };

  const removeMedication = (index: number) => {
    setFormData({
      ...formData,
      medications: formData.medications.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      alert('Please select a valid patient');
      setShowPatientSearch(true);
      return;
    }
    if (!formData.reason.trim()) {
      alert('Please enter a reason for referral');
      return;
    }
    if (formData.type === 'doctor_to_doctor' && !formData.receivingDoctor) {
      alert('Please select a receiving doctor for doctor-to-doctor referrals');
      return;
    }
    if (formData.type === 'external' && !formData.referringContact.name) {
      alert('Please enter referring contact name for external referrals');
      return;
    }

    const submitData: any = {
      type: formData.type,
      patient: formData.patient,
      reason: formData.reason,
      urgency: formData.urgency,
      status: 'pending',
      referredDate: new Date().toISOString(),
    };

    if (formData.type === 'doctor_to_doctor') {
      if (formData.referringDoctor) submitData.referringDoctor = formData.referringDoctor;
      if (formData.receivingDoctor) submitData.receivingDoctor = formData.receivingDoctor;
    } else if (formData.type === 'external') {
      if (formData.referringClinic) submitData.referringClinic = formData.referringClinic;
      if (formData.referringContact.name) {
        submitData.referringContact = {
          name: formData.referringContact.name,
          phone: formData.referringContact.phone || undefined,
          email: formData.referringContact.email || undefined,
        };
      }
      if (formData.receivingClinic) submitData.receivingClinic = formData.receivingClinic;
    }

    if (formData.specialty) submitData.specialty = formData.specialty;
    if (formData.notes) submitData.notes = formData.notes;
    if (formData.chiefComplaint) submitData.chiefComplaint = formData.chiefComplaint;
    if (formData.diagnosis) submitData.diagnosis = formData.diagnosis;
    if (formData.relevantHistory) submitData.relevantHistory = formData.relevantHistory;
    if (formData.medications.length > 0) submitData.medications = formData.medications;
    if (formData.followUpRequired) {
      submitData.followUpRequired = true;
      if (formData.followUpDate) submitData.followUpDate = formData.followUpDate;
    }

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-h-[80vh] overflow-y-auto">
      {/* Referral Type */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Referral Type *</label>
        <select
          required
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="doctor_to_doctor">Doctor to Doctor</option>
          <option value="patient_to_patient">Patient to Patient</option>
          <option value="external">External</option>
        </select>
      </div>

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

      {/* Doctor to Doctor Fields */}
      {formData.type === 'doctor_to_doctor' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Referring Doctor (Optional)</label>
            <select
              value={formData.referringDoctor}
              onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select referring doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor._id} value={doctor._id}>
                  Dr. {doctor.firstName} {doctor.lastName}
                  {doctor.specialization && ` - ${doctor.specialization}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Receiving Doctor *</label>
            <select
              required={formData.type === 'doctor_to_doctor'}
              value={formData.receivingDoctor}
              onChange={(e) => setFormData({ ...formData, receivingDoctor: e.target.value })}
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select receiving doctor</option>
              {doctors.map((doctor) => (
                <option key={doctor._id} value={doctor._id}>
                  Dr. {doctor.firstName} {doctor.lastName}
                  {doctor.specialization && ` - ${doctor.specialization}`}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* External Referral Fields */}
      {formData.type === 'external' && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Referring Clinic (Optional)</label>
            <input
              type="text"
              value={formData.referringClinic}
              onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
              placeholder="Name of referring clinic"
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Referring Contact Name *</label>
            <input
              type="text"
              required={formData.type === 'external'}
              value={formData.referringContact.name}
              onChange={(e) => setFormData({
                ...formData,
                referringContact: { ...formData.referringContact, name: e.target.value }
              })}
              placeholder="Contact person name"
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Phone (Optional)</label>
            <input
              type="tel"
              value={formData.referringContact.phone}
              onChange={(e) => setFormData({
                ...formData,
                referringContact: { ...formData.referringContact, phone: e.target.value }
              })}
              placeholder="Phone number"
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Email (Optional)</label>
            <input
              type="email"
              value={formData.referringContact.email}
              onChange={(e) => setFormData({
                ...formData,
                referringContact: { ...formData.referringContact, email: e.target.value }
              })}
              placeholder="Email address"
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Receiving Clinic (Optional)</label>
            <input
              type="text"
              value={formData.receivingClinic}
              onChange={(e) => setFormData({ ...formData, receivingClinic: e.target.value })}
              placeholder="Name of receiving clinic"
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      {/* Reason for Referral */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason for Referral *</label>
        <textarea
          required
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="Describe the reason for this referral"
          rows={3}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Urgency */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Urgency *</label>
        <select
          required
          value={formData.urgency}
          onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="routine">Routine</option>
          <option value="urgent">Urgent</option>
          <option value="stat">STAT</option>
        </select>
      </div>

      {/* Specialty */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Required Specialty (Optional)</label>
        <input
          type="text"
          value={formData.specialty}
          onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
          placeholder="e.g., Cardiology, Orthopedics"
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Chief Complaint */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Chief Complaint (Optional)</label>
        <textarea
          value={formData.chiefComplaint}
          onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
          placeholder="Patient's chief complaint"
          rows={2}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Diagnosis */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Diagnosis (Optional)</label>
        <input
          type="text"
          value={formData.diagnosis}
          onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
          placeholder="Current diagnosis"
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Relevant History */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Relevant History (Optional)</label>
        <textarea
          value={formData.relevantHistory}
          onChange={(e) => setFormData({ ...formData, relevantHistory: e.target.value })}
          placeholder="Relevant medical history"
          rows={3}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Medications */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Current Medications (Optional)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={medicationInput}
            onChange={(e) => setMedicationInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMedication();
              }
            }}
            placeholder="Enter medication and press Enter"
            className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={addMedication}
            className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Add
          </button>
        </div>
        {formData.medications.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {formData.medications.map((med, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-md"
              >
                {med}
                <button
                  type="button"
                  onClick={() => removeMedication(index)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Additional Notes (Optional)</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any additional notes or instructions"
          rows={3}
          className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Follow-up */}
      <div className="space-y-2">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="followUpRequired"
            checked={formData.followUpRequired}
            onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="followUpRequired" className="ml-2 block text-xs text-gray-700">
            Follow-up Required
          </label>
        </div>
        {formData.followUpRequired && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Follow-up Date (Optional)</label>
            <input
              type="date"
              value={formData.followUpDate}
              onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
              className="block w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Create Referral
        </button>
      </div>
    </form>
  );
}

