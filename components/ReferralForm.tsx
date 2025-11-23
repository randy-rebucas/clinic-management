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
    <form onSubmit={handleSubmit}>
      <div className="max-h-[80vh] overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
          {/* Referral Type */}
          <div>
            <label className="block text-xs font-medium mb-2">
              Referral Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="doctor_to_doctor">Doctor to Doctor</option>
              <option value="patient_to_patient">Patient to Patient</option>
              <option value="external">External</option>
            </select>
          </div>

          {/* Patient Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Patient <span className="text-red-600">*</span>
            </label>
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
                className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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
                        onClick={() => selectPatient(patient)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded transition-colors"
                      >
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-xs font-medium">{patient.firstName} {patient.lastName}</span>
                          <span className="text-xs text-gray-500">
                            {patient.patientCode && `${patient.patientCode}`}
                            {age && ` • Age: ${age} years`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
                  <div className="p-2">
                    <p className="text-sm text-gray-600">No patients found</p>
                  </div>
                </div>
              )}
            </div>
            {formData.patient && !selectedPatient && (
              <p className="text-xs text-red-600 mt-1">Please select a valid patient from the list</p>
            )}
          </div>

          {/* Doctor to Doctor Fields */}
          {formData.type === 'doctor_to_doctor' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Referring Doctor (Optional)</label>
                <select
                  value={formData.referringDoctor || undefined}
                  onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value === 'none' ? '' : e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                >
                  <option value="none">Select referring doctor</option>
                  {doctors.map((doctor) => (
                    <option key={doctor._id} value={doctor._id}>
                      Dr. {doctor.firstName} {doctor.lastName}
                      {doctor.specialization && ` - ${doctor.specialization}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Receiving Doctor <span className="text-red-600">*</span>
                </label>
                <select
                  required={formData.type === 'doctor_to_doctor'}
                  value={formData.receivingDoctor}
                  onChange={(e) => setFormData({ ...formData, receivingDoctor: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
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
                <label className="block text-sm font-medium mb-2">Referring Clinic (Optional)</label>
                <input
                  type="text"
                  value={formData.referringClinic}
                  onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                  placeholder="Name of referring clinic"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Referring Contact Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required={formData.type === 'external'}
                  value={formData.referringContact.name}
                  onChange={(e) => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, name: e.target.value }
                  })}
                  placeholder="Contact person name"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact Phone (Optional)</label>
                <input
                  type="tel"
                  value={formData.referringContact.phone}
                  onChange={(e) => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, phone: e.target.value }
                  })}
                  placeholder="Phone number"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact Email (Optional)</label>
                <input
                  type="email"
                  value={formData.referringContact.email}
                  onChange={(e) => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, email: e.target.value }
                  })}
                  placeholder="Email address"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Receiving Clinic (Optional)</label>
                <input
                  type="text"
                  value={formData.receivingClinic}
                  onChange={(e) => setFormData({ ...formData, receivingClinic: e.target.value })}
                  placeholder="Name of receiving clinic"
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                />
              </div>
            </>
          )}

          {/* Reason for Referral */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Reason for Referral <span className="text-red-600">*</span>
            </label>
            <textarea
              required
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Describe the reason for this referral"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y min-h-[60px]"
            />
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Urgency <span className="text-red-600">*</span>
            </label>
            <select
              required
              value={formData.urgency}
              onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>

          {/* Specialty */}
          <div>
            <label className="block text-sm font-medium mb-2">Required Specialty (Optional)</label>
            <input
              type="text"
              value={formData.specialty}
              onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="e.g., Cardiology, Orthopedics"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>

          {/* Chief Complaint */}
          <div>
            <label className="block text-sm font-medium mb-2">Chief Complaint (Optional)</label>
            <textarea
              value={formData.chiefComplaint}
              onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
              placeholder="Patient's chief complaint"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y min-h-[40px]"
            />
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-sm font-medium mb-2">Diagnosis (Optional)</label>
            <input
              type="text"
              value={formData.diagnosis}
              onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
              placeholder="Current diagnosis"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            />
          </div>

          {/* Relevant History */}
          <div>
            <label className="block text-sm font-medium mb-2">Relevant History (Optional)</label>
            <textarea
              value={formData.relevantHistory}
              onChange={(e) => setFormData({ ...formData, relevantHistory: e.target.value })}
              placeholder="Relevant medical history"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y min-h-[60px]"
            />
          </div>

          {/* Medications */}
          <div>
            <label className="block text-sm font-medium mb-2">Current Medications (Optional)</label>
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
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />
              <button
                type="button"
                onClick={addMedication}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Add
              </button>
            </div>
            {formData.medications.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {formData.medications.map((med, index) => (
                  <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">
                    {med}
                    <button
                      type="button"
                      onClick={() => removeMedication(index)}
                      className="ml-1 p-0 min-w-0 hover:text-blue-900"
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
            <label className="block text-sm font-medium mb-2">Additional Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes or instructions"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm resize-y min-h-[60px]"
            />
          </div>

          {/* Follow-up */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="followUpRequired"
                checked={formData.followUpRequired}
                onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="followUpRequired" className="text-xs cursor-pointer">
                Follow-up Required
              </label>
            </div>
            {formData.followUpRequired && (
              <div>
                <label className="block text-sm font-medium mb-2">Follow-up Date (Optional)</label>
                <input
                  type="date"
                  value={formData.followUpDate}
                  onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-200 my-4"></div>
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              Create Referral
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

