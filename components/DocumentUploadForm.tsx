'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { Button, TextField, Select, Card, Flex, Box, Text, Badge, Callout, Checkbox, Separator, Popover, Heading } from '@radix-ui/themes';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

interface DocumentUploadFormProps {
  initialData?: {
    patient?: string;
    visit?: string;
  };
  patients: Patient[];
  visits: Visit[];
  onSubmit: (formData: FormData) => void;
  onCancel?: () => void;
}

const DOCUMENT_CATEGORIES = [
  { value: 'referral', label: 'Referral' },
  { value: 'laboratory_result', label: 'Laboratory Result' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'medical_certificate', label: 'Medical Certificate' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'id', label: 'ID' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'other', label: 'Other' },
] as const;

export default function DocumentUploadForm({
  initialData,
  patients,
  visits,
  onSubmit,
  onCancel,
}: DocumentUploadFormProps) {
  const [formData, setFormData] = useState({
    file: null as File | null,
    title: '',
    description: '',
    category: '' as string,
    patient: initialData?.patient || '',
    visit: initialData?.visit || '',
    tags: '',
    notes: '',
    scanned: false,
    // Referral specific
    referringDoctor: '',
    referringClinic: '',
    referralDate: '',
    referralReason: '',
    // Imaging specific
    modality: '',
    bodyPart: '',
    studyDate: '',
    radiologist: '',
    // Medical certificate specific
    issueDate: '',
    validUntil: '',
    purpose: '',
    restrictions: '',
    // Lab result specific
    testType: '',
    testDate: '',
    labName: '',
  });

  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

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
    if (formData.file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      if (formData.file.type.startsWith('image/')) {
        reader.readAsDataURL(formData.file);
      } else {
        setFilePreview(null);
      }
    } else {
      setFilePreview(null);
    }
  }, [formData.file]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.patient-search-container')) {
        setShowPatientSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, file, title: formData.title || file.name });
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!formData.file) {
      alert('Please select a file to upload');
      return;
    }
    if (!formData.title) {
      alert('Please enter a title');
      return;
    }
    if (!formData.category) {
      alert('Please select a category');
      return;
    }

    const submitFormData = new FormData();
    submitFormData.append('file', formData.file);
    submitFormData.append('title', formData.title);
    if (formData.description) submitFormData.append('description', formData.description);
    submitFormData.append('category', formData.category);
    if (formData.patient) submitFormData.append('patientId', formData.patient);
    if (formData.visit) submitFormData.append('visitId', formData.visit);
    if (formData.tags) submitFormData.append('tags', formData.tags);
    if (formData.notes) submitFormData.append('notes', formData.notes);
    submitFormData.append('scanned', formData.scanned.toString());

    // Category-specific data
    if (formData.category === 'referral') {
      const referralData: any = {};
      if (formData.referringDoctor) referralData.referringDoctor = formData.referringDoctor;
      if (formData.referringClinic) referralData.referringClinic = formData.referringClinic;
      if (formData.referralDate) referralData.referralDate = formData.referralDate;
      if (formData.referralReason) referralData.reason = formData.referralReason;
      if (Object.keys(referralData).length > 0) {
        submitFormData.append('referralData', JSON.stringify(referralData));
      }
    }

    if (formData.category === 'imaging') {
      const imagingData: any = {};
      if (formData.modality) imagingData.modality = formData.modality;
      if (formData.bodyPart) imagingData.bodyPart = formData.bodyPart;
      if (formData.studyDate) imagingData.studyDate = formData.studyDate;
      if (formData.radiologist) imagingData.radiologist = formData.radiologist;
      if (Object.keys(imagingData).length > 0) {
        submitFormData.append('imagingData', JSON.stringify(imagingData));
      }
    }

    if (formData.category === 'medical_certificate') {
      const medicalCertificateData: any = {};
      if (formData.issueDate) medicalCertificateData.issueDate = formData.issueDate;
      if (formData.validUntil) medicalCertificateData.validUntil = formData.validUntil;
      if (formData.purpose) medicalCertificateData.purpose = formData.purpose;
      if (formData.restrictions) medicalCertificateData.restrictions = formData.restrictions;
      if (Object.keys(medicalCertificateData).length > 0) {
        submitFormData.append('medicalCertificateData', JSON.stringify(medicalCertificateData));
      }
    }

    if (formData.category === 'laboratory_result') {
      const labResultData: any = {};
      if (formData.testType) labResultData.testType = formData.testType;
      if (formData.testDate) labResultData.testDate = formData.testDate;
      if (formData.labName) labResultData.labName = formData.labName;
      if (Object.keys(labResultData).length > 0) {
        submitFormData.append('labResultData', JSON.stringify(labResultData));
      }
    }

    onSubmit(submitFormData);
  };

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

  return (
    <form onSubmit={handleSubmit}>
      <Box style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        <Flex direction="column" gap="3" p="4">
          {/* File Upload */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              File <Text color="red">*</Text>
            </Text>
            <input
              type="file"
              onChange={handleFileChange}
              required
              style={{
                width: '100%',
                fontSize: 'var(--font-size-1)',
                color: 'var(--gray-9)',
              }}
            />
            {filePreview && (
              <Box mt="2">
                <img
                  src={filePreview}
                  alt="Preview"
                  style={{
                    maxWidth: '100%',
                    height: '128px',
                    objectFit: 'contain',
                    border: '1px solid var(--gray-6)',
                    borderRadius: '6px',
                  }}
                />
              </Box>
            )}
            {formData.file && !filePreview && (
              <Text size="1" color="gray" mt="2" as="div">
                Selected: {formData.file.name} ({(formData.file.size / 1024).toFixed(2)} KB)
              </Text>
            )}
          </Box>

          {/* Title */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Title <Text color="red">*</Text>
            </Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Description */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Description</Text>
            <TextField.Root size="2">
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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

          {/* Category */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">
              Category <Text color="red">*</Text>
            </Text>
            <Select.Root
              size="2"
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <Select.Trigger placeholder="Select category..." />
              <Select.Content>
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <Select.Item key={cat.value} value={cat.value}>
                    {cat.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>

      {/* Patient Selection */}
      <Box>
        <Text size="1" weight="medium" mb="1" as="div">Patient (Optional)</Text>
        <Popover.Root open={showPatientSearch} onOpenChange={setShowPatientSearch}>
            <Popover.Trigger>
            <TextField.Root size="1" style={{ width: '100%' }}>
              <input
                type="text"
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
                {filteredPatients.map((patient) => (
                  <Button
                    key={patient._id}
                    variant="ghost"
                    onClick={() => {
                      selectPatient(patient);
                      setShowPatientSearch(false);
                    }}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start' }}
                  >
                    <Text weight="medium" size="1">{patient.firstName} {patient.lastName}</Text>
                    {patient.patientCode && (
                      <Text size="1" color="gray">{patient.patientCode}</Text>
                    )}
                  </Button>
                ))}
              </Flex>
            ) : patientSearch ? (
              <Text size="1" color="gray">No patients found</Text>
            ) : (
              <Text size="1" color="gray">Start typing to search...</Text>
            )}
          </Popover.Content>
        </Popover.Root>
      </Box>

          {/* Visit Selection */}
          {formData.patient && visits.length > 0 && (
            <Box>
              <Text size="2" weight="medium" mb="2" as="div">Visit (Optional)</Text>
              <Select.Root
                size="2"
                value={formData.visit}
                onValueChange={(value) => setFormData({ ...formData, visit: value })}
              >
                <Select.Trigger placeholder="Select a visit..." />
                <Select.Content>
                  {visits.map((visit) => (
                    <Select.Item key={visit._id} value={visit._id}>
                      {visit.visitCode} - {new Date(visit.date).toLocaleDateString()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
          )}

          {/* Tags */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Tags (comma-separated)</Text>
            <TextField.Root size="2">
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="e.g., urgent, follow-up, important"
                style={{ all: 'unset', flex: 1 }}
              />
            </TextField.Root>
          </Box>

          {/* Notes */}
          <Box>
            <Text size="2" weight="medium" mb="2" as="div">Notes</Text>
            <TextField.Root size="2">
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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

      {/* Scanned */}
      <Flex align="center" gap="2">
        <Checkbox
          id="scanned"
          checked={formData.scanned}
          onCheckedChange={(checked) => setFormData({ ...formData, scanned: checked as boolean })}
          size="1"
        />
        <Text as="label" htmlFor="scanned" size="1">
          This is a scanned document
        </Text>
      </Flex>

          {/* Category-specific fields */}
          {formData.category === 'referral' && (
            <Box>
              <Separator />
              <Flex direction="column" gap="3" pt="3">
                <Heading size="3">Referral Information</Heading>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Referring Doctor</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.referringDoctor}
                      onChange={(e) => setFormData({ ...formData, referringDoctor: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Referring Clinic</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.referringClinic}
                      onChange={(e) => setFormData({ ...formData, referringClinic: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Referral Date</Text>
                  <TextField.Root size="1" type="date">
                    <input
                      type="date"
                      value={formData.referralDate}
                      onChange={(e) => setFormData({ ...formData, referralDate: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Reason</Text>
                  <TextField.Root size="1">
                    <textarea
                      value={formData.referralReason}
                      onChange={(e) => setFormData({ ...formData, referralReason: e.target.value })}
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
              </Flex>
            </Box>
          )}

          {formData.category === 'imaging' && (
            <Box>
              <Separator />
              <Flex direction="column" gap="3" pt="3">
                <Heading size="3">Imaging Information</Heading>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Modality</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.modality}
                      onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                      placeholder="X-ray, CT, MRI, Ultrasound, etc."
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Body Part</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.bodyPart}
                      onChange={(e) => setFormData({ ...formData, bodyPart: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Study Date</Text>
                  <TextField.Root size="1" type="date">
                    <input
                      type="date"
                      value={formData.studyDate}
                      onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Radiologist</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.radiologist}
                      onChange={(e) => setFormData({ ...formData, radiologist: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
              </Flex>
            </Box>
          )}

          {formData.category === 'medical_certificate' && (
            <Box>
              <Separator />
              <Flex direction="column" gap="3" pt="3">
                <Heading size="3">Medical Certificate Information</Heading>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Issue Date</Text>
                  <TextField.Root size="1" type="date">
                    <input
                      type="date"
                      value={formData.issueDate}
                      onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Valid Until</Text>
                  <TextField.Root size="1" type="date">
                    <input
                      type="date"
                      value={formData.validUntil}
                      onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Purpose</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.purpose}
                      onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                      placeholder="Work, School, Travel, etc."
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Restrictions</Text>
                  <TextField.Root size="1">
                    <textarea
                      value={formData.restrictions}
                      onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
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
              </Flex>
            </Box>
          )}

          {formData.category === 'laboratory_result' && (
            <Box>
              <Separator />
              <Flex direction="column" gap="3" pt="3">
                <Heading size="3">Laboratory Result Information</Heading>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Test Type</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.testType}
                      onChange={(e) => setFormData({ ...formData, testType: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Test Date</Text>
                  <TextField.Root size="1" type="date">
                    <input
                      type="date"
                      value={formData.testDate}
                      onChange={(e) => setFormData({ ...formData, testDate: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box>
                  <Text size="1" weight="medium" color="gray" mb="2" as="div">Lab Name</Text>
                  <TextField.Root size="1">
                    <input
                      type="text"
                      value={formData.labName}
                      onChange={(e) => setFormData({ ...formData, labName: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
              </Flex>
            </Box>
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
              Upload Document
            </Button>
          </Flex>
        </Flex>
      </Box>
    </form>
  );
}

