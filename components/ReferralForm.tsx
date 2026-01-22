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
      setTimeout(() => {
        setSelectedPatient(patient || null);
        if (patient) {
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
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
        <div className="flex flex-col gap-6 p-4 sm:p-6">
          {/* Referral Type & Patient Selection */}
          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Referral Information</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Referral Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Referral Type <span className="text-red-600">*</span>
                </label>
                <select
                  required
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                >
                  <option value="doctor_to_doctor">Doctor to Doctor</option>
                  <option value="patient_to_patient">Patient to Patient</option>
                  <option value="external">External</option>
                </select>
              </div>

              {/* Patient Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all text-sm"
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
                            onClick={() => selectPatient(patient)}
                            className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded transition-colors"
                          >
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-sm font-semibold text-gray-900">{patient.firstName} {patient.lastName}</span>
                              <span className="text-xs text-gray-600">
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
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-xl">
                      <div className="p-2">
                        <p className="text-sm text-gray-600">No patients found</p>
                      </div>
                    </div>
                  )}
                </div>
                {formData.patient && !selectedPatient && (
                  <p className="text-xs text-red-600 mt-2 font-medium">Please select a valid patient from the list</p>
                )}
              </div>
            </div>
          </div>

          {/* Doctor to Doctor Fields */}
          {formData.type === 'doctor_to_doctor' && (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">Doctor Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Referring Doctor (Optional)</label>
                  <select
                    value={formData.referringDoctor || undefined}
                    onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value === 'none' ? '' : e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Receiving Doctor <span className="text-red-600">*</span>
                  </label>
                  <select
                    required={formData.type === 'doctor_to_doctor'}
                    value={formData.receivingDoctor}
                    onChange={(e) => setFormData({ ...formData, receivingDoctor: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm bg-white"
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
              </div>
            </div>
          )}

          {/* External Referral Fields */}
          {formData.type === 'external' && (
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900">External Referral Information</h3>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Referring Clinic (Optional)</label>
                  <input
                    type="text"
                    value={formData.referringClinic}
                    onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                    placeholder="Name of referring clinic"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Contact Phone (Optional)</label>
                    <input
                      type="tel"
                      value={formData.referringContact.phone}
                      onChange={(e) => setFormData({
                        ...formData,
                        referringContact: { ...formData.referringContact, phone: e.target.value }
                      })}
                      placeholder="Phone number"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Contact Email (Optional)</label>
                    <input
                      type="email"
                      value={formData.referringContact.email}
                      onChange={(e) => setFormData({
                        ...formData,
                        referringContact: { ...formData.referringContact, email: e.target.value }
                      })}
                      placeholder="Email address"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Receiving Clinic (Optional)</label>
                  <input
                    type="text"
                    value={formData.receivingClinic}
                    onChange={(e) => setFormData({ ...formData, receivingClinic: e.target.value })}
                    placeholder="Name of receiving clinic"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Referral Details */}
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Referral Details</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Reason for Referral */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Reason for Referral <span className="text-red-600">*</span>
                </label>
                <textarea
                  required
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Describe the reason for this referral"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm resize-y"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Urgency */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Urgency <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={formData.urgency}
                    onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm bg-white"
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>

                {/* Specialty */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">Required Specialty (Optional)</label>
                  <input
                    type="text"
                    value={formData.specialty}
                    onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                    placeholder="e.g., Cardiology, Orthopedics"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Medical Information */}
          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Medical Information</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Chief Complaint */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Chief Complaint (Optional)</label>
                <textarea
                  value={formData.chiefComplaint}
                  onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                  placeholder="Patient's chief complaint"
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm resize-y"
                />
              </div>

              {/* Diagnosis */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Diagnosis (Optional)</label>
                <input
                  type="text"
                  value={formData.diagnosis}
                  onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                  placeholder="Current diagnosis"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm"
                />
              </div>

              {/* Relevant History */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Relevant History (Optional)</label>
                <textarea
                  value={formData.relevantHistory}
                  onChange={(e) => setFormData({ ...formData, relevantHistory: e.target.value })}
                  placeholder="Relevant medical history"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition-all text-sm resize-y"
                />
              </div>
            </div>
          </div>

          {/* Medications & Notes */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Medications & Notes</h3>
            </div>
            <div className="flex flex-col gap-4">
              {/* Medications */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Current Medications (Optional)</label>
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
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={addMedication}
                    className="px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-semibold"
                  >
                    Add
                  </button>
                </div>
                {formData.medications.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {formData.medications.map((med, index) => (
                      <span key={index} className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-semibold border border-purple-200">
                        {med}
                        <button
                          type="button"
                          onClick={() => removeMedication(index)}
                          className="ml-1 p-0 min-w-0 hover:text-purple-900 font-bold"
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
                <label className="block text-xs font-semibold text-gray-700 mb-2">Additional Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any additional notes or instructions"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm resize-y"
                />
              </div>

              {/* Follow-up */}
              <div className="flex flex-col gap-3 p-3 bg-white/50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="followUpRequired"
                    checked={formData.followUpRequired}
                    onChange={(e) => setFormData({ ...formData, followUpRequired: e.target.checked })}
                    className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <label htmlFor="followUpRequired" className="text-sm font-semibold text-gray-700 cursor-pointer">
                    Follow-up Required
                  </label>
                </div>
                {formData.followUpRequired && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Follow-up Date (Optional)</label>
                    <input
                      type="date"
                      value={formData.followUpDate}
                      onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <hr className="border-gray-200" />
          <div className="flex justify-end gap-3 pt-2">
            {onCancel && (
              <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold border border-gray-200">
                Cancel
              </button>
            )}
            <button type="submit" className="px-4 py-2.5 text-sm bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all font-semibold shadow-md">
              Create Referral
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

