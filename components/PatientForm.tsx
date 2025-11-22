'use client';

import { useState, FormEvent } from 'react';
import { TextField, Select, TextArea, Button, Card, Flex, Box, Text } from '@radix-ui/themes';

interface AllergyEntry {
  substance: string;
  reaction: string;
  severity: string;
}

interface PreExistingCondition {
  condition: string;
  diagnosisDate?: string;
  status: 'active' | 'resolved' | 'chronic';
  notes?: string;
}

interface PatientFormData {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  sex?: 'male' | 'female' | 'other' | 'unknown';
  civilStatus?: string;
  nationality?: string;
  occupation?: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  emergencyContact: {
    name: string;
    phone: string;
    relationship: string;
  };
  identifiers?: {
    philHealth?: string;
    govId?: string;
  };
  medicalHistory: string;
  preExistingConditions: PreExistingCondition[];
  allergies: AllergyEntry[];
  familyHistory: Record<string, string>;
}

interface PatientFormProps {
  initialData?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel?: () => void;
}

export default function PatientForm({ initialData, onSubmit, onCancel }: PatientFormProps) {
  // Parse initial allergies - support both string array and structured objects
  const parseInitialAllergies = (): AllergyEntry[] => {
    if (!initialData?.allergies) return [];
    const allergies: any = initialData.allergies;
    if (typeof allergies === 'string') {
      // Legacy format: comma-separated string
      return allergies
        .split(',')
        .map((a: string) => a.trim())
        .filter((a: string) => a.length > 0)
        .map((substance: string) => ({ substance, reaction: '', severity: 'unknown' }));
    }
    if (Array.isArray(allergies)) {
      return allergies.map((allergy: any) => {
        if (typeof allergy === 'string') {
          return { substance: allergy, reaction: '', severity: 'unknown' };
        }
        return {
          substance: allergy.substance || '',
          reaction: allergy.reaction || '',
          severity: allergy.severity || 'unknown',
        };
      });
    }
    return [];
  };

  // Format dateOfBirth for input field
  const formatDateForInput = (date: any): string => {
    if (!date) return '';
    if (typeof date === 'string') {
      // If it's an ISO string, extract just the date part
      return date.split('T')[0];
    }
    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }
    return '';
  };

  const [formData, setFormData] = useState<PatientFormData>({
    firstName: initialData?.firstName || '',
    middleName: initialData?.middleName || '',
    lastName: initialData?.lastName || '',
    suffix: initialData?.suffix || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    dateOfBirth: formatDateForInput(initialData?.dateOfBirth),
    sex: initialData?.sex || 'unknown',
    civilStatus: initialData?.civilStatus || '',
    nationality: initialData?.nationality || '',
    occupation: initialData?.occupation || '',
    address: {
      street: initialData?.address?.street || '',
      city: initialData?.address?.city || '',
      state: initialData?.address?.state || '',
      zipCode: initialData?.address?.zipCode || '',
    },
    emergencyContact: {
      name: initialData?.emergencyContact?.name || '',
      phone: initialData?.emergencyContact?.phone || '',
      relationship: initialData?.emergencyContact?.relationship || '',
    },
    identifiers: initialData?.identifiers ? {
      philHealth: initialData.identifiers.philHealth || '',
      govId: initialData.identifiers.govId || '',
    } : {
      philHealth: '',
      govId: '',
    },
    medicalHistory: initialData?.medicalHistory || '',
    preExistingConditions: (initialData as any)?.preExistingConditions || [],
    allergies: parseInitialAllergies(),
    familyHistory: (initialData as any)?.familyHistory || {},
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Filter out empty allergies and conditions
    const filteredAllergies = formData.allergies.filter((a) => a.substance.trim().length > 0);
    const filteredConditions = formData.preExistingConditions.filter((c) => c.condition.trim().length > 0);
    // Filter out empty family history entries
    const filteredFamilyHistory = Object.fromEntries(
      Object.entries(formData.familyHistory).filter(([condition, relation]) => condition.trim().length > 0)
    );
    onSubmit({ 
      ...formData, 
      allergies: filteredAllergies,
      preExistingConditions: filteredConditions,
      familyHistory: filteredFamilyHistory,
    });
  };

  const addAllergy = () => {
    setFormData({
      ...formData,
      allergies: [...formData.allergies, { substance: '', reaction: '', severity: 'unknown' }],
    });
  };

  const removeAllergy = (index: number) => {
    setFormData({
      ...formData,
      allergies: formData.allergies.filter((_, i) => i !== index),
    });
  };

  const updateAllergy = (index: number, field: keyof AllergyEntry, value: string) => {
    const updated = [...formData.allergies];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, allergies: updated });
  };

  return (
    <Box style={{ maxHeight: '80vh', overflowY: 'auto', paddingRight: '4px' }}>
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="4">
      {/* Personal Information */}
      <Card>
        <Box p="3">
          <Text size="3" weight="bold" mb="3" as="div">Personal Information</Text>
          <Flex direction="column" gap="3">
            {/* Name Fields */}
            <Flex direction={{ initial: 'column', md: 'row' }} gap="2" wrap="wrap">
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">
                  First Name <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Middle Name</Text>
                <TextField.Root size="2">
                  <input
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">
                  Last Name <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Suffix</Text>
                <TextField.Root size="2">
                  <input
                    value={formData.suffix}
                    onChange={(e) => setFormData({ ...formData, suffix: e.target.value })}
                    placeholder="Jr., Sr., III"
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
            </Flex>
            
            {/* Demographics */}
            <Flex direction={{ initial: 'column', md: 'row' }} gap="2" wrap="wrap">
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">
                  Date of Birth <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    type="date"
                    required
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Sex</Text>
                <Select.Root
                  value={formData.sex}
                  onValueChange={(value) => setFormData({ ...formData, sex: value as any })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="unknown">Unknown</Select.Item>
                    <Select.Item value="male">Male</Select.Item>
                    <Select.Item value="female">Female</Select.Item>
                    <Select.Item value="other">Other</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Civil Status</Text>
                <TextField.Root size="2">
                  <input
                    value={formData.civilStatus}
                    onChange={(e) => setFormData({ ...formData, civilStatus: e.target.value })}
                    placeholder="Single, Married, Divorced, etc."
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Nationality</Text>
                <TextField.Root size="2">
                  <input
                    value={formData.nationality}
                    onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1" minWidth="150px">
                <Text size="1" weight="medium" mb="1" as="div">Occupation</Text>
                <TextField.Root size="2">
                  <input
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
            </Flex>
          </Flex>
        </Box>
      </Card>

      {/* Contact & Address Information */}
      <Card>
        <Box p="3">
          <Text size="3" weight="bold" mb="3" as="div">Contact & Address</Text>
          <Flex direction="column" gap="3">
            {/* Contact Info */}
            <Flex direction={{ initial: 'column', md: 'row' }} gap="2">
              <Box flexGrow="1">
                <Text size="1" weight="medium" mb="1" as="div">
                  Email <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
              <Box flexGrow="1">
                <Text size="1" weight="medium" mb="1" as="div">
                  Phone <Text color="red">*</Text>
                </Text>
                <TextField.Root size="2">
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
              </Box>
            </Flex>

            {/* Address Fields */}
            <Box pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <Text size="2" weight="medium" mb="2" as="div">Address</Text>
              <Flex direction="column" gap="2">
                <Box>
                  <Text size="1" weight="medium" mb="1" as="div">
                    Street Address <Text color="red">*</Text>
                  </Text>
                  <TextField.Root size="2">
                    <input
                      required
                      value={formData.address.street}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          address: { ...formData.address, street: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Flex direction={{ initial: 'column', md: 'row' }} gap="2">
                  <Box flexGrow="1">
                    <Text size="1" weight="medium" mb="1" as="div">
                      City <Text color="red">*</Text>
                    </Text>
                    <TextField.Root size="2">
                      <input
                        required
                        value={formData.address.city}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, city: e.target.value },
                          })
                        }
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                  <Box flexGrow="1">
                    <Text size="1" weight="medium" mb="1" as="div">
                      State <Text color="red">*</Text>
                    </Text>
                    <TextField.Root size="2">
                      <input
                        required
                        value={formData.address.state}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, state: e.target.value },
                          })
                        }
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                  <Box flexGrow="1">
                    <Text size="1" weight="medium" mb="1" as="div">
                      Zip Code <Text color="red">*</Text>
                    </Text>
                    <TextField.Root size="2">
                      <input
                        required
                        value={formData.address.zipCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            address: { ...formData.address, zipCode: e.target.value },
                          })
                        }
                        style={{ all: 'unset', flex: 1 }}
                      />
                    </TextField.Root>
                  </Box>
                </Flex>
              </Flex>
            </Box>
          </Flex>
        </Box>
      </Card>

      {/* Emergency Contact & Identifiers */}
      <Card>
        <Box p="3">
          <Text size="3" weight="bold" mb="3" as="div">Emergency Contact & Identifiers</Text>
          <Flex direction="column" gap="3">
            {/* Emergency Contact */}
            <Box>
              <Text size="2" weight="medium" mb="2" as="div">Emergency Contact</Text>
              <Flex direction={{ initial: 'column', md: 'row' }} gap="2">
                <Box flexGrow="1">
                  <Text size="1" weight="medium" mb="1" as="div">
                    Name <Text color="red">*</Text>
                  </Text>
                  <TextField.Root size="2">
                    <input
                      required
                      value={formData.emergencyContact.name}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergencyContact: { ...formData.emergencyContact, name: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1">
                  <Text size="1" weight="medium" mb="1" as="div">
                    Phone <Text color="red">*</Text>
                  </Text>
                  <TextField.Root size="2" type="tel">
                    <input
                      type="tel"
                      required
                      value={formData.emergencyContact.phone}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergencyContact: { ...formData.emergencyContact, phone: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1">
                  <Text size="1" weight="medium" mb="1" as="div">
                    Relationship <Text color="red">*</Text>
                  </Text>
                  <TextField.Root size="2">
                    <input
                      required
                      value={formData.emergencyContact.relationship}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          emergencyContact: {
                            ...formData.emergencyContact,
                            relationship: e.target.value,
                          },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
              </Flex>
            </Box>

            {/* Identifiers */}
            <Box pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <Text size="2" weight="medium" mb="2" as="div">Identifiers</Text>
              <Flex direction={{ initial: 'column', md: 'row' }} gap="2">
                <Box flexGrow="1">
                  <Text size="1" weight="medium" mb="1" as="div">PhilHealth ID</Text>
                  <TextField.Root size="2">
                    <input
                      value={formData.identifiers?.philHealth || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          identifiers: { ...formData.identifiers, philHealth: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1">
                  <Text size="1" weight="medium" mb="1" as="div">Government ID</Text>
                  <TextField.Root size="2">
                    <input
                      value={formData.identifiers?.govId || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          identifiers: { ...formData.identifiers, govId: e.target.value },
                        })
                      }
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
              </Flex>
            </Box>
          </Flex>
        </Box>
      </Card>

      {/* Medical Information */}
      <Card>
        <Box p="3">
          <Text size="3" weight="bold" mb="3" as="div">Medical Information</Text>
          <Flex direction="column" gap="3">
            <Box>
              <Text size="1" weight="medium" mb="1" as="div">Medical History</Text>
              <TextArea
                value={formData.medicalHistory}
                onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
                rows={3}
                placeholder="Enter patient&apos;s medical history, previous surgeries, chronic conditions, etc."
                size="2"
              />
            </Box>

            {/* Allergies */}
            <Box>
              <Flex justify="between" align="center" mb="2">
                <Text size="1" weight="medium" as="div">Allergies</Text>
                <Button type="button" onClick={addAllergy} size="1" variant="soft" color="blue">
                  Add
                </Button>
              </Flex>
              {formData.allergies.length === 0 ? (
                <Box p="3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <Text size="1" color="gray">No allergies recorded.</Text>
                </Box>
              ) : (
                <Flex direction="column" gap="2">
                  {formData.allergies.map((allergy, index) => (
                    <Card key={index} size="1">
                      <Flex direction={{ initial: 'column', md: 'row' }} gap="2" wrap="wrap">
                        <Box flexGrow="1" minWidth="150px">
                          <Text size="1" weight="medium" mb="1" as="div">Substance</Text>
                          <TextField.Root size="1">
                            <input
                              value={allergy.substance}
                              onChange={(e) => updateAllergy(index, 'substance', e.target.value)}
                              placeholder="e.g., Penicillin"
                              style={{ all: 'unset', flex: 1 }}
                            />
                          </TextField.Root>
                        </Box>
                        <Box flexGrow="1" minWidth="150px">
                          <Text size="1" weight="medium" mb="1" as="div">Reaction</Text>
                          <TextField.Root size="1">
                            <input
                              value={allergy.reaction}
                              onChange={(e) => updateAllergy(index, 'reaction', e.target.value)}
                              placeholder="e.g., Rash"
                              style={{ all: 'unset', flex: 1 }}
                            />
                          </TextField.Root>
                        </Box>
                        <Box flexGrow="1" minWidth="150px">
                          <Text size="1" weight="medium" mb="1" as="div">Severity</Text>
                          <Select.Root
                            value={allergy.severity}
                            onValueChange={(value) => updateAllergy(index, 'severity', value)}
                          >
                            <Select.Trigger />
                            <Select.Content>
                              <Select.Item value="unknown">Unknown</Select.Item>
                              <Select.Item value="mild">Mild</Select.Item>
                              <Select.Item value="moderate">Moderate</Select.Item>
                              <Select.Item value="severe">Severe</Select.Item>
                              <Select.Item value="life-threatening">Life-threatening</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        </Box>
                        <Box flexShrink="0" style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <Button
                            type="button"
                            onClick={() => removeAllergy(index)}
                            size="1"
                            variant="soft"
                            color="red"
                          >
                            Remove
                          </Button>
                        </Box>
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Box>
          
            {/* Pre-existing Conditions */}
            <Box>
              <Flex justify="between" align="center" mb="2">
                <Text size="1" weight="medium" as="div">Pre-existing Conditions</Text>
                <Button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      preExistingConditions: [
                        ...formData.preExistingConditions,
                        { condition: '', status: 'active' },
                      ],
                    });
                  }}
                  size="1"
                  variant="soft"
                  color="blue"
                >
                  Add
                </Button>
              </Flex>
              {formData.preExistingConditions.length === 0 ? (
                <Box p="3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <Text size="1" color="gray">No pre-existing conditions recorded.</Text>
                </Box>
              ) : (
                <Flex direction="column" gap="2">
                  {formData.preExistingConditions.map((condition, index) => (
                    <Card key={index} size="1">
                      <Flex direction={{ initial: 'column', md: 'row' }} gap="2" wrap="wrap">
                        <Box flexGrow="2" minWidth="200px">
                          <Text size="1" weight="medium" mb="1" as="div">Condition</Text>
                          <TextField.Root size="1">
                            <input
                              value={condition.condition}
                              onChange={(e) => {
                                const updated = [...formData.preExistingConditions];
                                updated[index] = { ...updated[index], condition: e.target.value };
                                setFormData({ ...formData, preExistingConditions: updated });
                              }}
                              placeholder="e.g., Diabetes"
                              style={{ all: 'unset', flex: 1 }}
                            />
                          </TextField.Root>
                        </Box>
                        <Box flexGrow="1" minWidth="120px">
                          <Text size="1" weight="medium" mb="1" as="div">Status</Text>
                          <Select.Root
                            value={condition.status}
                            onValueChange={(value) => {
                              const updated = [...formData.preExistingConditions];
                              updated[index] = { ...updated[index], status: value as any };
                              setFormData({ ...formData, preExistingConditions: updated });
                            }}
                          >
                            <Select.Trigger />
                            <Select.Content>
                              <Select.Item value="active">Active</Select.Item>
                              <Select.Item value="chronic">Chronic</Select.Item>
                              <Select.Item value="resolved">Resolved</Select.Item>
                            </Select.Content>
                          </Select.Root>
                        </Box>
                        <Box flexGrow="1" minWidth="120px">
                          <Text size="1" weight="medium" mb="1" as="div">Date</Text>
                <TextField.Root size="1">
                  <input
                    type="date"
                    value={condition.diagnosisDate || ''}
                    onChange={(e) => {
                      const updated = [...formData.preExistingConditions];
                      updated[index] = { ...updated[index], diagnosisDate: e.target.value };
                      setFormData({ ...formData, preExistingConditions: updated });
                    }}
                    style={{ all: 'unset', flex: 1 }}
                  />
                </TextField.Root>
                        </Box>
                        <Box flexShrink="0" style={{ display: 'flex', alignItems: 'flex-end' }}>
                          <Button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                preExistingConditions: formData.preExistingConditions.filter((_, i) => i !== index),
                              });
                            }}
                            size="1"
                            variant="soft"
                            color="red"
                          >
                            Remove
                          </Button>
                        </Box>
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Box>

            {/* Family History */}
            <Box>
              <Flex justify="between" align="center" mb="2">
                <Text size="1" weight="medium" as="div">Family History</Text>
                <Button
                  type="button"
                  onClick={() => {
                    const condition = prompt('Enter condition (e.g., Diabetes):');
                    if (condition && condition.trim()) {
                      const relation = prompt('Enter family relation (e.g., Father, Mother):') || '';
                      setFormData({
                        ...formData,
                        familyHistory: {
                          ...formData.familyHistory,
                          [condition.trim()]: relation.trim(),
                        },
                      });
                    }
                  }}
                  size="1"
                  variant="soft"
                  color="blue"
                >
                  Add
                </Button>
              </Flex>
              {Object.keys(formData.familyHistory).length === 0 ? (
                <Box p="3" style={{ textAlign: 'center', border: '1px dashed var(--gray-6)', borderRadius: 'var(--radius-2)' }}>
                  <Text size="1" color="gray">No family history recorded.</Text>
                </Box>
              ) : (
                <Flex direction="column" gap="1">
                  {Object.entries(formData.familyHistory).map(([condition, relation], index) => (
                    <Card key={index} size="1">
                      <Flex justify="between" align="center">
                        <Box flexGrow="1">
                          <Text size="1" weight="medium">{condition}</Text>
                          {relation && <Text size="1" color="gray" ml="2">({relation})</Text>}
                        </Box>
                        <Button
                          type="button"
                          onClick={() => {
                            const updated = { ...formData.familyHistory };
                            delete updated[condition];
                            setFormData({ ...formData, familyHistory: updated });
                          }}
                          size="1"
                          variant="soft"
                          color="red"
                        >
                          Remove
                        </Button>
                      </Flex>
                    </Card>
                  ))}
                </Flex>
              )}
            </Box>
          </Flex>
        </Box>
      </Card>

          {/* Form Actions */}
          <Flex justify="end" gap="2" pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
            {onCancel && (
              <Button type="button" onClick={onCancel} variant="soft" size="2">
                Cancel
              </Button>
            )}
            <Button type="submit" size="2">
              Save Patient
            </Button>
          </Flex>
        </Flex>
      </form>
    </Box>
  );
}
