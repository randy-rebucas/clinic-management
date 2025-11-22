'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Button, TextField, Select, TextArea, Card, Flex, Box, Text, Badge, Callout, Checkbox, Separator, Popover } from '@radix-ui/themes';

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
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="3" p="4">
          {/* Patient Selection */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Patient <Text color="red">*</Text>
            </Text>
        <Popover.Root open={showPatientSearch} onOpenChange={setShowPatientSearch}>
          <Popover.Trigger>
            <TextField.Root size="2" style={{ width: '100%' }}>
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
          </Popover.Trigger>
          <Popover.Content style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '200px', overflowY: 'auto' }}>
            {filteredPatients.length > 0 ? (
              <Flex direction="column" gap="1">
                {filteredPatients.map((patient) => {
                  const age = patient.dateOfBirth
                    ? Math.floor((new Date().getTime() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                    : null;
                  return (
                    <Button
                      key={patient._id}
                      variant="ghost"
                      onClick={() => {
                        selectPatient(patient);
                        setShowPatientSearch(false);
                      }}
                      style={{ justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start' }}
                    >
                      <Text weight="medium">{patient.firstName} {patient.lastName}</Text>
                      <Text size="1" color="gray">
                        {patient.patientCode && `${patient.patientCode}`}
                        {age && ` • Age: ${age} years`}
                      </Text>
                    </Button>
                  );
                })}
              </Flex>
            ) : patientSearch ? (
              <Text size="2" color="gray">No patients found</Text>
            ) : (
              <Text size="2" color="gray">Start typing to search...</Text>
            )}
          </Popover.Content>
        </Popover.Root>
        {formData.patient && !selectedPatient && (
          <Text size="1" color="red" mt="1" as="div">Please select a valid patient from the list</Text>
        )}
      </Box>

          {/* Test Type */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Test Type <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2">
              <input
                type="text"
                required
                value={formData.request.testType}
                onChange={(e) => setFormData({
                  ...formData,
                  request: { ...formData.request, testType: e.target.value }
                })}
                placeholder="e.g., CBC, Urinalysis, Blood Glucose"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Test Code (Optional) */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Test Code (Optional)</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.request.testCode}
                onChange={(e) => setFormData({
                  ...formData,
                  request: { ...formData.request, testCode: e.target.value }
                })}
                placeholder="e.g., LOINC code"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Description */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Description (Optional)</Text>
            <TextArea
              size="2"
              value={formData.request.description}
              onChange={(e) => setFormData({
                ...formData,
                request: { ...formData.request, description: e.target.value }
              })}
              placeholder="Additional test description or notes"
              rows={2}
            />
          </Box>

          {/* Urgency */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Urgency <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              value={formData.request.urgency}
              onValueChange={(value) => setFormData({
                ...formData,
                request: { ...formData.request, urgency: value as 'routine' | 'urgent' | 'stat' }
              })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="routine">Routine</Select.Item>
                <Select.Item value="urgent">Urgent</Select.Item>
                <Select.Item value="stat">STAT</Select.Item>
              </Select.Content>
            </Select.Root>
          </Box>

      {/* Fasting Required */}
      <Flex align="center" gap="2">
        <Checkbox
          id="fastingRequired"
          checked={formData.request.fastingRequired}
          onCheckedChange={(checked) => setFormData({
            ...formData,
            request: { ...formData.request, fastingRequired: checked as boolean }
          })}
          size="1"
        />
        <Text as="label" htmlFor="fastingRequired" size="1">
          Fasting Required
        </Text>
      </Flex>

          {/* Special Instructions */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Special Instructions (Optional)</Text>
            <TextArea
              size="2"
              value={formData.request.specialInstructions}
              onChange={(e) => setFormData({
                ...formData,
                request: { ...formData.request, specialInstructions: e.target.value }
              })}
              placeholder="Any special instructions for the lab"
              rows={2}
            />
          </Box>

          {/* Preparation Notes */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Preparation Notes (Optional)</Text>
            <TextArea
              size="2"
              value={formData.request.preparationNotes}
              onChange={(e) => setFormData({
                ...formData,
                request: { ...formData.request, preparationNotes: e.target.value }
              })}
              placeholder="Patient preparation instructions"
              rows={2}
            />
          </Box>

          {/* Form Actions */}
          <Separator />
          <Flex justify="end" gap="2">
            {onCancel && (
              <Button type="button" variant="soft" onClick={onCancel} size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Create Lab Order
            </Button>
          </Flex>
        </Flex>
      </Box>
    </form>
  );
}

