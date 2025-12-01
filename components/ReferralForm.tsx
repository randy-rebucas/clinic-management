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
            <Label htmlFor="referralType">Referral Type <span className="text-red-500">*</span></Label>
            <select
              id="referralType"
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="doctor_to_doctor">Doctor to Doctor</option>
              <option value="patient_to_patient">Patient to Patient</option>
              <option value="external">External</option>
            </select>
          </div>

          {/* Patient Selection */}
          <div>
            <Label htmlFor="patientSearch">Patient <span className="text-red-600">*</span></Label>
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
                <Label htmlFor="referringDoctor">Referring Doctor (Optional)</Label>
                <select
                  id="referringDoctor"
                  value={formData.referringDoctor || undefined}
                  onChange={e => setFormData({ ...formData, referringDoctor: e.target.value === 'none' ? '' : e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
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
                <Label htmlFor="receivingDoctor">Receiving Doctor <span className="text-red-600">*</span></Label>
                <select
                  id="receivingDoctor"
                  required={formData.type === 'doctor_to_doctor'}
                  value={formData.receivingDoctor}
                  onChange={e => setFormData({ ...formData, receivingDoctor: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
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
                <Label htmlFor="referringClinic">Referring Clinic (Optional)</Label>
                <Input
                  id="referringClinic"
                  type="text"
                  value={formData.referringClinic}
                  onChange={e => setFormData({ ...formData, referringClinic: e.target.value })}
                  placeholder="Name of referring clinic"
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
              <div>
                <Label htmlFor="referringContactName">Referring Contact Name <span className="text-red-600">*</span></Label>
                <Input
                  id="referringContactName"
                  type="text"
                  required={formData.type === 'external'}
                  value={formData.referringContact.name}
                  onChange={e => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, name: e.target.value }
                  })}
                  placeholder="Contact person name"
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
              <div>
                <Label htmlFor="referringContactPhone">Contact Phone (Optional)</Label>
                <Input
                  id="referringContactPhone"
                  type="tel"
                  value={formData.referringContact.phone}
                  onChange={e => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, phone: e.target.value }
                  })}
                  placeholder="Phone number"
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
              <div>
                <Label htmlFor="referringContactEmail">Contact Email (Optional)</Label>
                <Input
                  id="referringContactEmail"
                  type="email"
                  value={formData.referringContact.email}
                  onChange={e => setFormData({
                    ...formData,
                    referringContact: { ...formData.referringContact, email: e.target.value }
                  })}
                  placeholder="Email address"
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
              <div>
                <Label htmlFor="receivingClinic">Receiving Clinic (Optional)</Label>
                <Input
                  id="receivingClinic"
                  type="text"
                  value={formData.receivingClinic}
                  onChange={e => setFormData({ ...formData, receivingClinic: e.target.value })}
                  placeholder="Name of receiving clinic"
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
            </>
          )}

          {/* Reason for Referral */}
          <div>
            <Label htmlFor="reason">Reason for Referral <span className="text-red-600">*</span></Label>
            <Input
              id="reason"
              as="textarea"
              required
              value={formData.reason}
              onChange={e => setFormData({ ...formData, reason: e.target.value })}
              placeholder="Describe the reason for this referral"
              style={{ all: 'unset', width: '100%' }}
              rows={3}
            />
          </div>

          {/* Urgency */}
          <div>
            <Label htmlFor="urgency">Urgency <span className="text-red-600">*</span></Label>
            <select
              id="urgency"
              required
              value={formData.urgency}
              onChange={e => setFormData({ ...formData, urgency: e.target.value as any })}
              className="w-full border border-gray-300 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            >
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </div>

          {/* Specialty */}
          <div>
            <Label htmlFor="specialty">Required Specialty (Optional)</Label>
            <Input
              id="specialty"
              type="text"
              value={formData.specialty}
              onChange={e => setFormData({ ...formData, specialty: e.target.value })}
              placeholder="e.g., Cardiology, Orthopedics"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Chief Complaint */}
          <div>
            <Label htmlFor="chiefComplaint">Chief Complaint (Optional)</Label>
            <Input
              id="chiefComplaint"
              as="textarea"
              value={formData.chiefComplaint}
              onChange={e => setFormData({ ...formData, chiefComplaint: e.target.value })}
              placeholder="Patient's chief complaint"
              style={{ all: 'unset', width: '100%' }}
              rows={2}
            />
          </div>

          {/* Diagnosis */}
          <div>
            <Label htmlFor="diagnosis">Diagnosis (Optional)</Label>
            <Input
              id="diagnosis"
              type="text"
              value={formData.diagnosis}
              onChange={e => setFormData({ ...formData, diagnosis: e.target.value })}
              placeholder="Current diagnosis"
              style={{ all: 'unset', width: '100%' }}
            />
          </div>

          {/* Relevant History */}
          <div>
            <Label htmlFor="relevantHistory">Relevant History (Optional)</Label>
            <Input
              id="relevantHistory"
              as="textarea"
              value={formData.relevantHistory}
              onChange={e => setFormData({ ...formData, relevantHistory: e.target.value })}
              placeholder="Relevant medical history"
              style={{ all: 'unset', width: '100%' }}
              rows={3}
            />
          </div>

          {/* Medications */}
          <div>
            <label className="block text-sm font-medium mb-2">Current Medications (Optional)</label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={medicationInput}
                onChange={e => setMedicationInput(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addMedication();
                  }
                }}
                placeholder="Enter medication and press Enter"
                style={{ all: 'unset', flex: 1 }}
              />
              <Button type="button" onClick={addMedication} size="sm">
                Add
              </Button>
            </div>
            {formData.medications.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {formData.medications.map((med, index) => (
                  <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">
                    {med}
                    <Button type="button" variant="destructive" size="sm" onClick={() => removeMedication(index)}>
                      ×
                    </Button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Input
              id="notes"
              as="textarea"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional notes or instructions"
              style={{ all: 'unset', width: '100%' }}
              rows={3}
            />
          </div>

          {/* Follow-up */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                type="checkbox"
                id="followUpRequired"
                checked={formData.followUpRequired}
                onChange={e => setFormData({ ...formData, followUpRequired: e.target.checked })}
                style={{ width: '1.25rem', height: '1.25rem' }}
              />
              <Label htmlFor="followUpRequired" className="text-xs cursor-pointer">
                Follow-up Required
              </Label>
            </div>
            {formData.followUpRequired && (
              <div>
                <Label htmlFor="followUpDate">Follow-up Date (Optional)</Label>
                <Input
                  id="followUpDate"
                  type="date"
                  value={formData.followUpDate}
                  onChange={e => setFormData({ ...formData, followUpDate: e.target.value })}
                  style={{ all: 'unset', width: '100%' }}
                />
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="border-t border-gray-200 my-4"></div>
          <div className="flex justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="default">
              Create Referral
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

