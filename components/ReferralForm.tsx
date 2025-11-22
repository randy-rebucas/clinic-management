'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Flex, Box, Text, TextField, Select, Button, Separator, Switch, Badge } from '@radix-ui/themes';

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
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="3" p="4">
          {/* Referral Type */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Referral Type <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              required
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as any })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="doctor_to_doctor">Doctor to Doctor</Select.Item>
                <Select.Item value="patient_to_patient">Patient to Patient</Select.Item>
                <Select.Item value="external">External</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>

          {/* Patient Selection */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Patient <Text color="red">*</Text>
            </Text>
            <Box position="relative" className="patient-search-container">
              <TextField.Root size="2">
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
                  style={{ all: 'unset', flex: 1 }}
                />
              </TextField.Root>
              {showPatientSearch && filteredPatients.length > 0 && (
                <Box
                  position="absolute"
                  style={{
                    zIndex: 10,
                    marginTop: '4px',
                    width: '100%',
                    backgroundColor: 'white',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '6px',
                    boxShadow: 'var(--shadow-4)',
                    maxHeight: '192px',
                    overflowY: 'auto',
                  }}
                >
                  {filteredPatients.map((patient) => {
                    const age = patient.dateOfBirth
                      ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                      : null;
                    return (
                      <Button
                        key={patient._id}
                        type="button"
                        variant="ghost"
                        onClick={() => selectPatient(patient)}
                        style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }}
                      >
                        <Flex direction="column" align="start" gap="1">
                          <Text size="2" weight="medium">{patient.firstName} {patient.lastName}</Text>
                          <Text size="1" color="gray">
                            {patient.patientCode && `${patient.patientCode}`}
                            {age && ` • Age: ${age} years`}
                          </Text>
                        </Flex>
                      </Button>
                    );
                  })}
                </Box>
              )}
              {showPatientSearch && patientSearch && filteredPatients.length === 0 && (
                <Box
                  position="absolute"
                  style={{
                    zIndex: 10,
                    marginTop: '4px',
                    width: '100%',
                    backgroundColor: 'white',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '6px',
                    boxShadow: 'var(--shadow-4)',
                  }}
                >
                  <Box p="2">
                    <Text size="2" color="gray">No patients found</Text>
                  </Box>
                </Box>
              )}
            </Box>
            {formData.patient && !selectedPatient && (
              <Text size="1" color="red" mt="1" as="div">Please select a valid patient from the list</Text>
            )}
          </Box>

          {/* Doctor to Doctor Fields */}
          {formData.type === 'doctor_to_doctor' && (
            <>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Referring Doctor (Optional)</Text>
                <Select.Root
                  size="2"
                  value={formData.referringDoctor || undefined}
                  onValueChange={(value) => setFormData({ ...formData, referringDoctor: value === 'none' ? '' : value })}
                >
                  <Select.Trigger placeholder="Select referring doctor" />
                  <Select.Content>
                    <Select.Item value="none">None</Select.Item>
                    {doctors.map((doctor) => (
                      <Select.Item key={doctor._id} value={doctor._id}>
                        Dr. {doctor.firstName} {doctor.lastName}
                        {doctor.specialization && ` - ${doctor.specialization}`}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  Receiving Doctor <Text color="red">*</Text>
                </Text>
                <Select.Root
                  size="2"
                  required={formData.type === 'doctor_to_doctor'}
                  value={formData.receivingDoctor}
                  onValueChange={(value) => setFormData({ ...formData, receivingDoctor: value })}
                >
                  <Select.Trigger placeholder="Select receiving doctor" />
                  <Select.Content>
                    {doctors.map((doctor) => (
                      <Select.Item key={doctor._id} value={doctor._id}>
                        Dr. {doctor.firstName} {doctor.lastName}
                        {doctor.specialization && ` - ${doctor.specialization}`}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
            </>
          )}

          {/* External Referral Fields */}
          {formData.type === 'external' && (
            <>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Referring Clinic (Optional)</Text>
                <TextField.Root size="2">
                  <input
                    type="text"
                    value={formData.referringClinic}
                    onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                    placeholder="Name of referring clinic"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">
                  Referring Contact Name <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    type="text"
                    required={formData.type === 'external'}
                    value={formData.referringContact.name}
                    onChange={(e) => setFormData({
                      ...formData,
                      referringContact: { ...formData.referringContact, name: e.target.value }
                    })}
                    placeholder="Contact person name"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Contact Phone (Optional)</Text>
                <TextField.Root size="2" type="tel">
                  <input
                    type="tel"
                    value={formData.referringContact.phone}
                    onChange={(e) => setFormData({
                      ...formData,
                      referringContact: { ...formData.referringContact, phone: e.target.value }
                    })}
                    placeholder="Phone number"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Contact Email (Optional)</Text>
                <TextField.Root size="2" type="email">
                  <input
                    type="email"
                    value={formData.referringContact.email}
                    onChange={(e) => setFormData({
                      ...formData,
                      referringContact: { ...formData.referringContact, email: e.target.value }
                    })}
                    placeholder="Email address"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Receiving Clinic (Optional)</Text>
                <TextField.Root size="2">
                  <input
                    type="text"
                    value={formData.receivingClinic}
                    onChange={(e) => setFormData({ ...formData, receivingClinic: e.target.value })}
                    placeholder="Name of receiving clinic"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
            </>
          )}

          {/* Reason for Referral */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Reason for Referral <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2">
              <textarea
                required
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Describe the reason for this referral"
                rows={3}
                style={{
                  all: 'unset',
                  flex: 1,
                  width: '100%',
                  minHeight: '60px',
                  resize: 'vertical',
                }}
              />
            </TextField.Root>
          </Box>

          {/* Urgency */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Urgency <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              required
              value={formData.urgency}
              onValueChange={(value) => setFormData({ ...formData, urgency: value as any })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="routine">Routine</Select.Item>
                <Select.Item value="urgent">Urgent</Select.Item>
                <Select.Item value="stat">STAT</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>

          {/* Specialty */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Required Specialty (Optional)</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                placeholder="e.g., Cardiology, Orthopedics"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Chief Complaint */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Chief Complaint (Optional)</Text>
            <TextField.Root size="2">
              <textarea
                value={formData.chiefComplaint}
                onChange={(e) => setFormData({ ...formData, chiefComplaint: e.target.value })}
                placeholder="Patient's chief complaint"
                rows={2}
                style={{
                  all: 'unset',
                  flex: 1,
                  width: '100%',
                  minHeight: '40px',
                  resize: 'vertical',
                }}
              />
            </TextField.Root>
          </Box>

          {/* Diagnosis */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Diagnosis (Optional)</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.diagnosis}
                onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                placeholder="Current diagnosis"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Relevant History */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Relevant History (Optional)</Text>
            <TextField.Root size="2">
              <textarea
                value={formData.relevantHistory}
                onChange={(e) => setFormData({ ...formData, relevantHistory: e.target.value })}
                placeholder="Relevant medical history"
                rows={3}
                style={{
                  all: 'unset',
                  flex: 1,
                  width: '100%',
                  minHeight: '60px',
                  resize: 'vertical',
                }}
              />
            </TextField.Root>
          </Box>

          {/* Medications */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Current Medications (Optional)</Text>
            <Flex gap="2">
              <TextField.Root size="2" style={{ flex: 1 }}>
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
                  style={{ all: 'unset', flex: 1 }}
                />
              </TextField.Root>
              <Button type="button" onClick={addMedication} size="2">
                Add
              </Button>
            </Flex>
            {formData.medications.length > 0 && (
              <Flex gap="2" wrap="wrap" mt="2">
                {formData.medications.map((med, index) => (
                  <Badge key={index} color="blue" size="2">
                    {med}
                    <Button
                      type="button"
                      variant="ghost"
                      size="1"
                      onClick={() => removeMedication(index)}
                      style={{ marginLeft: '4px', padding: '0', minWidth: 'auto' }}
                    >
                      ×
                    </Button>
                  </Badge>
                ))}
              </Flex>
            )}
          </Box>

          {/* Notes */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Additional Notes (Optional)</Text>
            <TextField.Root size="2">
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any additional notes or instructions"
                rows={3}
                style={{
                  all: 'unset',
                  flex: 1,
                  width: '100%',
                  minHeight: '60px',
                  resize: 'vertical',
                }}
              />
            </TextField.Root>
          </Box>

          {/* Follow-up */}
          <Flex direction="column" gap="2">
            <Flex align="center" gap="2">
              <Switch
                size="2"
                id="followUpRequired"
                checked={formData.followUpRequired}
                onCheckedChange={(checked) => setFormData({ ...formData, followUpRequired: checked })}
              />
              <Text size="2" as="label" htmlFor="followUpRequired">
                Follow-up Required
              </Text>
            </Flex>
            {formData.followUpRequired && (
              <Box>
                <Text size="2" weight="medium" mb="2" as="div">Follow-up Date (Optional)</Text>
                <TextField.Root size="2" type="date">
                  <input
                    type="date"
                    value={formData.followUpDate}
                    onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
            )}
          </Flex>

          {/* Form Actions */}
          <Separator />
          <Flex justify="end" gap="2">
            {onCancel && (
              <Button type="button" variant="soft" onClick={onCancel} size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Create Referral
            </Button>
          </Flex>
        </Flex>
      </Box>
    </form>
  );
}

