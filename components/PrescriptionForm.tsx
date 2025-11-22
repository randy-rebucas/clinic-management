'use client';

import { useState, useEffect, FormEvent } from 'react';
import SignaturePad from './SignaturePad';
import { calculateDosage, calculateQuantity, formatDosageInstructions } from '@/lib/dosage-calculator';
import { Button, TextField, Flex, Box, Text, Callout, AlertDialog, Popover, Tooltip, TextArea, Separator, Heading, Badge, Card, IconButton } from '@radix-ui/themes';

interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  form: string;
  strength: string;
  unit: string;
  route: string;
  category: string;
  standardDosage?: string;
  standardFrequency?: string;
  dosageRanges?: Array<{
    minAge?: number;
    maxAge?: number;
    minWeight?: number;
    maxWeight?: number;
    dose: string;
    frequency: string;
    maxDailyDose?: string;
  }>;
}

interface Medication {
  medicineId?: string;
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  quantity?: number;
  instructions?: string;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  weight?: number;
}

interface PrescriptionFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
    medications?: Medication[];
    notes?: string;
  };
  patients: Patient[];
  onSubmit: (data: any) => void;
  onCancel?: () => void;
  providerName: string;
}

export default function PrescriptionForm({
  initialData,
  patients,
  onSubmit,
  onCancel,
  providerName,
}: PrescriptionFormProps) {
  const [formData, setFormData] = useState({
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    medications: (initialData?.medications || []) as Medication[],
    notes: initialData?.notes || '',
  });

  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<Medicine[]>([]);
  const [showMedicineSearch, setShowMedicineSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [showInteractionAlert, setShowInteractionAlert] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [drugInteractions, setDrugInteractions] = useState<Array<{
    medication1: string;
    medication2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    recommendation?: string;
  }>>([]);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

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
    if (medicineSearch.length >= 2) {
      const timer = setTimeout(() => {
        fetch(`/api/medicines?search=${encodeURIComponent(medicineSearch)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.success) {
              setMedicineResults(data.data.slice(0, 10));
            }
          })
          .catch(console.error);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setMedicineResults([]);
    }
  }, [medicineSearch]);

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      alert('Please select a valid patient');
      setShowPatientSearch(true);
      return;
    }
    if (formData.medications.length === 0) {
      alert('Please add at least one medication');
      return;
    }
    
    // Warn about severe interactions
    const severeInteractions = drugInteractions.filter(
      i => i.severity === 'contraindicated' || i.severity === 'severe'
    );
    if (severeInteractions.length > 0) {
      setPendingSubmit(true);
      setShowInteractionAlert(true);
      return;
    }
    
    handleSubmitConfirm();
  };

  const handleSubmitConfirm = () => {
    onSubmit({
      ...formData,
      digitalSignature: digitalSignature
        ? {
            providerName,
            signatureData: digitalSignature,
          }
        : undefined,
      drugInteractions: drugInteractions.length > 0 ? drugInteractions.map(i => ({
        ...i,
        checkedAt: new Date(),
      })) : undefined,
    });
  };

  const addMedication = () => {
    setFormData({
      ...formData,
      medications: [
        ...formData.medications,
        {
          name: '',
          form: '',
          strength: '',
          dose: '',
          route: '',
          frequency: '',
          durationDays: 7,
          quantity: 0,
        },
      ],
    });
  };

  const removeMedication = (index: number) => {
    const updated = formData.medications.filter((_, i) => i !== index);
    setFormData({
      ...formData,
      medications: updated,
    });
    
    // Recheck interactions after removal
    if (updated.length >= 2) {
      checkInteractions(updated);
    } else {
      setDrugInteractions([]);
    }
  };

  const selectMedicine = (medicine: Medicine, index: number) => {
    const updated = [...formData.medications];
    const patientInfo = {
      age: selectedPatient?.dateOfBirth
        ? Math.floor((new Date().getTime() - new Date(selectedPatient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : undefined,
      weight: selectedPatient?.weight,
    };

    const calculated = calculateDosage(medicine as any, patientInfo);

    updated[index] = {
      medicineId: medicine._id,
      name: medicine.name,
      genericName: medicine.genericName,
      form: medicine.form,
      strength: medicine.strength,
      dose: calculated.dose,
      route: medicine.route,
      frequency: calculated.frequency,
      durationDays: 7,
      quantity: calculateQuantity(calculated.frequency, 7, calculated.dose),
      instructions: formatDosageInstructions(medicine as any, calculated, 7),
    };

    setFormData({ ...formData, medications: updated });
    setShowMedicineSearch(false);
    setMedicineSearch('');
    
    // Check interactions after adding medication
    if (updated.length >= 2) {
      checkInteractions(updated);
    }
  };

  const updateMedication = (index: number, field: string, value: any) => {
    const updated = [...formData.medications];
    updated[index] = { ...updated[index], [field]: value };

    // Recalculate quantity if frequency or duration changes
    if (field === 'frequency' || field === 'durationDays') {
      const med = updated[index];
      if (med.frequency && med.durationDays && med.dose) {
        updated[index].quantity = calculateQuantity(med.frequency, med.durationDays, med.dose);
      }
    }

    setFormData({ ...formData, medications: updated });
    
    // Check interactions when medications change
    if (updated.length >= 2 && updated.every(m => m.name.trim())) {
      checkInteractions(updated);
    } else {
      setDrugInteractions([]);
    }
  };

  const checkInteractions = async (medications: Medication[]) => {
    if (medications.length < 2) {
      setDrugInteractions([]);
      return;
    }

    setCheckingInteractions(true);
    try {
      const response = await fetch('/api/prescriptions/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medications: medications.map(m => ({ name: m.name, genericName: m.genericName })),
          patientId: formData.patient || undefined,
          includePatientMedications: true,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setDrugInteractions(data.data.interactions || []);
      }
    } catch (error) {
      console.error('Error checking interactions:', error);
    } finally {
      setCheckingInteractions(false);
    }
  };

  const calculateDosageForMedication = (index: number) => {
    const medication = formData.medications[index];
    if (!medication.medicineId || !selectedPatient) return;

    fetch(`/api/medicines/${medication.medicineId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const medicine = data.data;
          const patientInfo = {
            age: selectedPatient.dateOfBirth
              ? Math.floor(
                  (new Date().getTime() - new Date(selectedPatient.dateOfBirth).getTime()) /
                    (365.25 * 24 * 60 * 60 * 1000)
                )
              : undefined,
            weight: selectedPatient.weight,
          };

          const calculated = calculateDosage(medicine, patientInfo);
          updateMedication(index, 'dose', calculated.dose);
          updateMedication(index, 'frequency', calculated.frequency);
          updateMedication(index, 'instructions', calculated.instructions);
          if (calculated.warnings && calculated.warnings.length > 0) {
            alert(calculated.warnings.join('\n'));
          }
        }
      })
      .catch(console.error);
  };

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patient: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}`);
    setShowPatientSearch(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="4" p="4">
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
                      <Text weight="medium" size="2">{patient.firstName} {patient.lastName}</Text>
                      <Text size="1" color="gray">
                        {age && `Age: ${age} years`}
                        {age && patient.weight && ' • '}
                        {patient.weight && `${patient.weight} kg`}
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

          {/* Drug Interactions Warning */}
          {drugInteractions.length > 0 && (
            <Callout.Root
              color={
                drugInteractions.some(i => i.severity === 'contraindicated' || i.severity === 'severe')
                  ? 'red'
                  : drugInteractions.some(i => i.severity === 'moderate')
                  ? 'yellow'
                  : 'blue'
              }
            >
              <Callout.Icon>
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </Callout.Icon>
              <Callout.Text>
                <Text size="2" weight="bold" mb="2" as="div">Drug Interaction Warning</Text>
                <Flex direction="column" gap="2">
                  {drugInteractions.map((interaction, idx) => (
                    <Box key={idx}>
                      <Flex align="center" gap="2" mb="1">
                        <Text size="2" weight="medium">
                          {interaction.medication1} + {interaction.medication2}
                        </Text>
                        <Badge
                          color={
                            interaction.severity === 'contraindicated' || interaction.severity === 'severe'
                              ? 'red'
                              : interaction.severity === 'moderate'
                              ? 'yellow'
                              : 'blue'
                          }
                          size="1"
                          variant="solid"
                        >
                          {interaction.severity.toUpperCase()}
                        </Badge>
                      </Flex>
                      <Text size="1" as="div" mb="1">{interaction.description}</Text>
                      {interaction.recommendation && (
                        <Text size="1" style={{ fontStyle: 'italic' }} as="div">{interaction.recommendation}</Text>
                      )}
                    </Box>
                  ))}
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}

          {/* Medications */}
          <Box>
            <Flex justify="between" align="center" mb="3">
              <Heading size="3">Medications</Heading>
              <Flex align="center" gap="3">
                {checkingInteractions && (
                  <Text size="1" color="gray">Checking interactions...</Text>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="1"
                  onClick={() => formData.medications.length >= 2 && checkInteractions(formData.medications)}
                  disabled={formData.medications.length < 2 || checkingInteractions}
                >
                  🔍 Check Interactions
                </Button>
                <Button
                  type="button"
                  variant="soft"
                  size="1"
                  onClick={addMedication}
                >
                  + Add Medication
                </Button>
              </Flex>
            </Flex>

            {formData.medications.length === 0 ? (
              <Text size="2" color="gray" as="div">No medications added. Click &quot;Add Medication&quot; to add one.</Text>
            ) : (
              <Flex direction="column" gap="3">
                {formData.medications.map((medication, index) => (
                  <Card key={index} variant="surface">
                    <Box p="3">
                      <Flex justify="between" align="start" mb="3">
                        <Heading size="3">Medication {index + 1}</Heading>
                        <IconButton
                          type="button"
                          variant="ghost"
                          color="red"
                          size="1"
                          onClick={() => removeMedication(index)}
                        >
                          Remove
                        </IconButton>
                      </Flex>

                {/* Medicine Search */}
                <Box mb="3">
                  <Text size="1" weight="medium" mb="1" as="div">Search Medicine</Text>
                  <Popover.Root open={showMedicineSearch} onOpenChange={setShowMedicineSearch}>
                    <Popover.Trigger>
                      <TextField.Root size="2" style={{ width: '100%' }}>
                        <input
                          type="text"
                          value={medicineSearch}
                          onChange={(e) => {
                            setMedicineSearch(e.target.value);
                            setShowMedicineSearch(true);
                          }}
                          onFocus={() => setShowMedicineSearch(true)}
                          placeholder="Type to search medicines..."
                          style={{ all: 'unset', flex: 1 }}
                        />
                      </TextField.Root>
                    </Popover.Trigger>
                    <Popover.Content style={{ width: 'var(--radix-popover-trigger-width)', maxHeight: '200px', overflowY: 'auto' }}>
                      {medicineResults.length > 0 ? (
                        <Flex direction="column" gap="1">
                          {medicineResults.map((medicine) => (
                            <Button
                              key={medicine._id}
                              variant="ghost"
                              onClick={() => {
                                selectMedicine(medicine, index);
                                setShowMedicineSearch(false);
                              }}
                              style={{ justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start' }}
                            >
                              <Text weight="medium" size="2">{medicine.name}</Text>
                              {medicine.genericName && (
                                <Text size="1" color="gray">{medicine.genericName}</Text>
                              )}
                              <Text size="1" color="gray">
                                {medicine.strength} • {medicine.form} • {medicine.category}
                              </Text>
                            </Button>
                          ))}
                        </Flex>
                      ) : medicineSearch ? (
                        <Text size="2" color="gray">No medicines found</Text>
                      ) : (
                        <Text size="2" color="gray">Start typing to search...</Text>
                      )}
                    </Popover.Content>
                  </Popover.Root>
                </Box>

                      {/* Medication Details */}
                      <Flex direction="column" gap="3">
                        <Flex gap="3" wrap="wrap">
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">
                              Name <Text color="red">*</Text>
                            </Text>
                            <TextField.Root size="2">
                              <input
                                type="text"
                                required
                                value={medication.name}
                                onChange={(e) => updateMedication(index, 'name', e.target.value)}
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                          {medication.genericName && (
                            <Box flexGrow="1" style={{ minWidth: '200px' }}>
                              <Text size="1" weight="medium" mb="2" as="div">Generic Name</Text>
                              <TextField.Root size="2" disabled>
                                <input
                                  type="text"
                                  value={medication.genericName}
                                  readOnly
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                          )}
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">Form</Text>
                            <TextField.Root size="2">
                              <input
                                type="text"
                                value={medication.form || ''}
                                onChange={(e) => updateMedication(index, 'form', e.target.value)}
                                placeholder="tablet, capsule, etc."
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">Strength</Text>
                            <TextField.Root size="2">
                              <input
                                type="text"
                                value={medication.strength || ''}
                                onChange={(e) => updateMedication(index, 'strength', e.target.value)}
                                placeholder="500 mg"
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">
                              Dose <Text color="red">*</Text>
                            </Text>
                            <Flex gap="2">
                              <Box flexGrow="1">
                                <TextField.Root size="2">
                                <input
                                  type="text"
                                  required
                                  value={medication.dose || ''}
                                  onChange={(e) => updateMedication(index, 'dose', e.target.value)}
                                  placeholder="500 mg"
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                              </Box>
                              {medication.medicineId && selectedPatient && (
                                <Tooltip content="Recalculate dosage based on patient info">
                                  <Button
                                    type="button"
                                    onClick={() => calculateDosageForMedication(index)}
                                    variant="soft"
                                    color="blue"
                                    size="2"
                                  >
                                    ↻
                                  </Button>
                                </Tooltip>
                              )}
                            </Flex>
                          </Box>
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">
                              Frequency <Text color="red">*</Text>
                            </Text>
                            <TextField.Root size="2">
                              <input
                                type="text"
                                required
                                value={medication.frequency || ''}
                                onChange={(e) => updateMedication(index, 'frequency', e.target.value)}
                                placeholder="BID, TID, QID, etc."
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">Duration (days)</Text>
                            <TextField.Root size="2" type="number">
                              <input
                                type="number"
                                min="1"
                                value={medication.durationDays || 7}
                                onChange={(e) => updateMedication(index, 'durationDays', parseInt(e.target.value) || 7)}
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                          <Box flexGrow="1" style={{ minWidth: '200px' }}>
                            <Text size="1" weight="medium" mb="2" as="div">Quantity</Text>
                            <TextField.Root size="2" type="number">
                              <input
                                type="number"
                                min="1"
                                value={medication.quantity || 0}
                                onChange={(e) => updateMedication(index, 'quantity', parseInt(e.target.value) || 0)}
                                style={{ all: 'unset', flex: 1 }}
                              />
                            </TextField.Root>
                          </Box>
                        </Flex>
                        <Box>
                          <Text size="1" weight="medium" mb="2" as="div">Instructions</Text>
                          <TextArea
                            size="2"
                            value={medication.instructions || ''}
                            onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                            rows={2}
                            placeholder="Take with food, etc."
                          />
                        </Box>
                      </Flex>
                    </Box>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>

          {/* Additional Notes */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Additional Notes</Text>
            <TextArea
              size="2"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </Box>

          {/* Digital Signature */}
          <Box>
            {digitalSignature ? (
              <Card variant="surface" style={{ backgroundColor: 'var(--green-2)', borderColor: 'var(--green-6)' }}>
                <Flex justify="between" align="center" p="3">
                  <Box>
                    <Text size="2" weight="medium" color="green" as="div">Digital Signature Added</Text>
                    <Text size="1" color="green" as="div">Signed by: {providerName}</Text>
                  </Box>
                  <Button
                    type="button"
                    variant="ghost"
                    size="1"
                    color="green"
                    onClick={() => {
                      setDigitalSignature(null);
                      setShowSignaturePad(true);
                    }}
                  >
                    Change
                  </Button>
                </Flex>
              </Card>
            ) : (
              <Button
                type="button"
                variant="soft"
                size="2"
                onClick={() => setShowSignaturePad(true)}
                style={{ width: '100%' }}
              >
                + Add Digital Signature
              </Button>
            )}
          </Box>

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black/30 backdrop-blur-md" onClick={() => setShowSignaturePad(false)} />
            <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-w-2xl w-full z-10">
              <SignaturePad
                onSave={(signatureData) => {
                  setDigitalSignature(signatureData);
                  setShowSignaturePad(false);
                }}
                onCancel={() => setShowSignaturePad(false)}
                providerName={providerName}
              />
            </div>
          </div>
        </div>
      )}

          {/* Form Actions */}
          <Separator />
          <Flex justify="end" gap="2">
            {onCancel && (
              <Button type="button" variant="soft" onClick={onCancel} size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Create Prescription
            </Button>
          </Flex>
        </Flex>
      </Box>

      {/* Drug Interaction Alert Dialog */}
      <AlertDialog.Root open={showInteractionAlert} onOpenChange={setShowInteractionAlert}>
        <AlertDialog.Content>
          <AlertDialog.Title>Drug Interaction Warning</AlertDialog.Title>
          <AlertDialog.Description>
            <Text mb="3" as="div">
              {drugInteractions.filter(i => i.severity === 'contraindicated' || i.severity === 'severe').length} severe or contraindicated drug interaction(s) detected.
            </Text>
            <Callout.Root color="red" size="2">
              <Callout.Text>
                Are you sure you want to proceed with this prescription?
              </Callout.Text>
            </Callout.Root>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" onClick={() => {
                setShowInteractionAlert(false);
                setPendingSubmit(false);
              }}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={() => {
                setShowInteractionAlert(false);
                handleSubmitConfirm();
                setPendingSubmit(false);
              }}>
                Proceed Anyway
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </form>
  );
}

