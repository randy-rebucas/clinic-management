'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VisitForm from './VisitForm';
import { Button, Tooltip, Container, Section, Flex, Box, Text, Heading, Card, Spinner, Badge, Select, IconButton, Separator, TextField } from '@radix-ui/themes';

interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email: string;
    phone: string;
  };
  provider?: {
    _id: string;
    name: string;
    email: string;
  };
  date: string;
  visitType: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  vitals?: {
    bp?: string;
    hr?: number;
    rr?: number;
    tempC?: number;
    spo2?: number;
    heightCm?: number;
    weightKg?: number;
    bmi?: number;
  };
  physicalExam?: {
    general?: string;
    heent?: string;
    chest?: string;
    cardiovascular?: string;
    abdomen?: string;
    neuro?: string;
    skin?: string;
    other?: string;
  };
  diagnoses: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  soapNotes?: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  };
  treatmentPlan?: {
    medications?: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration: string;
      instructions?: string;
    }>;
    procedures?: Array<{
      name: string;
      description?: string;
      scheduledDate?: string;
    }>;
    lifestyle?: Array<{
      category: string;
      instructions: string;
    }>;
    followUp?: {
      date?: string;
      instructions?: string;
      reminderSent?: boolean;
    };
  };
  digitalSignature?: {
    providerName: string;
    signatureData: string;
    signedAt: string;
  };
  followUpDate?: string;
  followUpReminderSent?: boolean;
  notes?: string;
  status: string;
  attachments?: Array<{
    _id?: string;
    filename: string;
    contentType?: string;
    size?: number;
    url?: string;
    uploadDate: string;
    notes?: string;
  }>;
}

export default function VisitDetailClient({ visitId }: { visitId: string }) {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchVisit();
    fetchUser();
  }, [visitId]);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/user/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setProviderName(data.data.name || 'Dr. Provider');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const fetchVisit = async () => {
    try {
      const res = await fetch(`/api/visits/${visitId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setVisit(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch visit:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (formData: any) => {
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: visit?.date ? new Date(visit.date) : new Date(),
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
          setEditing(false);
          alert('Visit updated successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to update visit:', error);
      alert('Failed to update visit');
    }
  };

  const handleStatusChange = async (status: string) => {
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleFileUpload = async (file: File, notes?: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (notes) {
        formData.append('notes', notes);
      }

      const res = await fetch(`/api/visits/${visitId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVisit(data.data);
          alert('File uploaded successfully!');
        } else {
          alert('Failed to upload file: ' + (data.error || 'Unknown error'));
        }
      } else {
        alert('Failed to upload file');
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      alert('Failed to upload file');
    }
  };

  const handlePrint = (type: 'medical-certificate' | 'lab-request') => {
    window.open(`/api/visits/${visitId}/print/${type}`, '_blank');
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading visit...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }

  if (!visit) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Heading size="5">Visit not found</Heading>
            <Button asChild variant="soft">
              <Link href="/visits">Back to Visits</Link>
            </Button>
          </Flex>
        </Container>
      </Section>
    );
  }

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Header */}
          <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3">
            <Box>
              <Flex align="center" gap="3" mb="2">
                <IconButton variant="ghost" size="2" asChild>
                  <Link href="/visits">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Link>
                </IconButton>
                <Heading size="8">Visit {visit.visitCode}</Heading>
              </Flex>
              <Text size="2" color="gray" ml="8">
                {visit.patient.firstName} {visit.patient.lastName} • {new Date(visit.date).toLocaleDateString()}
              </Text>
            </Box>
            <Flex gap="2" wrap="wrap">
              <Select.Root
                value={visit.status}
                onValueChange={(value) => handleStatusChange(value)}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="open">Open</Select.Item>
                  <Select.Item value="closed">Closed</Select.Item>
                  <Select.Item value="cancelled">Cancelled</Select.Item>
                </Select.Content>
              </Select.Root>
              {!editing && (
                <>
                  <Tooltip content="Print Medical Certificate">
                    <Button
                      onClick={() => handlePrint('medical-certificate')}
                      color="green"
                      size="2"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Medical Certificate
                    </Button>
                  </Tooltip>
                  <Tooltip content="Print Lab Request">
                    <Button
                      onClick={() => handlePrint('lab-request')}
                      color="purple"
                      size="2"
                    >
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Lab Request
                    </Button>
                  </Tooltip>
                  <Button
                    onClick={() => setEditing(true)}
                    size="2"
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '6px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </Button>
                </>
              )}
            </Flex>
          </Flex>

          {/* Edit Mode */}
          {editing ? (
            <Card>
              <Box p="3">
                <VisitForm
              initialData={{
                patient: visit.patient._id,
                visitType: visit.visitType as any,
                chiefComplaint: visit.chiefComplaint,
                historyOfPresentIllness: visit.historyOfPresentIllness,
                vitals: visit.vitals,
                physicalExam: visit.physicalExam,
                diagnoses: visit.diagnoses,
                soapNotes: visit.soapNotes,
                treatmentPlan: visit.treatmentPlan,
                followUpDate: visit.followUpDate,
                notes: visit.notes,
                digitalSignature: visit.digitalSignature ? {
                  providerName: visit.digitalSignature.providerName,
                  signatureData: visit.digitalSignature.signatureData,
                } : undefined,
              }}
              patients={[{ _id: visit.patient._id, firstName: visit.patient.firstName, lastName: visit.patient.lastName }]}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
              providerName={providerName}
            />
              </Box>
            </Card>
          ) : (
            /* View Mode */
            <Flex direction="column" gap="3">
              {/* Patient Info */}
              <Card>
                <Box p="3">
                  <Heading size="4" mb="3">Patient Information</Heading>
                  <Flex direction={{ initial: 'column', md: 'row' }} gap="4" wrap="wrap">
                    <Box>
                      <Text size="1" color="gray" mb="1" as="div">Name</Text>
                      <Text size="2">
                        {visit.patient.firstName} {visit.patient.lastName}
                      </Text>
                    </Box>
                    {visit.patient.patientCode && (
                      <Box>
                        <Text size="1" color="gray" mb="1" as="div">Patient ID</Text>
                        <Text size="2">{visit.patient.patientCode}</Text>
                      </Box>
                    )}
                    <Box>
                      <Text size="1" color="gray" mb="1" as="div">Email</Text>
                      <Text size="2">{visit.patient.email}</Text>
                    </Box>
                    <Box>
                      <Text size="1" color="gray" mb="1" as="div">Phone</Text>
                      <Text size="2">{visit.patient.phone}</Text>
                    </Box>
                  </Flex>
                </Box>
              </Card>

              {/* SOAP Notes */}
              {visit.soapNotes && (
                <Card>
                  <Box p="3">
                    <Heading size="4" mb="3">SOAP Notes</Heading>
                    <Flex direction="column" gap="3">
                      {visit.soapNotes.subjective && (
                        <Box>
                          <Text size="2" weight="bold" mb="2" as="div">S - Subjective</Text>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{visit.soapNotes.subjective}</Text>
                        </Box>
                      )}
                      {visit.soapNotes.objective && (
                        <Box>
                          <Text size="2" weight="bold" mb="2" as="div">O - Objective</Text>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{visit.soapNotes.objective}</Text>
                        </Box>
                      )}
                      {visit.soapNotes.assessment && (
                        <Box>
                          <Text size="2" weight="bold" mb="2" as="div">A - Assessment</Text>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{visit.soapNotes.assessment}</Text>
                        </Box>
                      )}
                      {visit.soapNotes.plan && (
                        <Box>
                          <Text size="2" weight="bold" mb="2" as="div">P - Plan</Text>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{visit.soapNotes.plan}</Text>
                        </Box>
                      )}
                    </Flex>
                  </Box>
                </Card>
              )}

              {/* Diagnoses */}
              {visit.diagnoses && visit.diagnoses.length > 0 && (
                <Card>
                  <Box p="3">
                    <Heading size="4" mb="3">Diagnoses</Heading>
                    <Flex direction="column" gap="2">
                      {visit.diagnoses.map((diag, idx) => (
                        <Card key={idx} variant="surface">
                          <Flex justify="between" align="start" gap="3" p="2">
                            <Box flexGrow="1">
                              {diag.code && (
                                <Text size="2" weight="medium" style={{ fontFamily: 'monospace', color: 'var(--blue-9)' }} as="div">
                                  {diag.code}
                                </Text>
                              )}
                              {diag.description && (
                                <Text size="2" mt="1" as="div">{diag.description}</Text>
                              )}
                            </Box>
                            {diag.primary && (
                              <Badge color="blue" size="1">Primary</Badge>
                            )}
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  </Box>
                </Card>
              )}

              {/* Treatment Plan */}
              {visit.treatmentPlan && (
                <Card>
                  <Box p="3">
                    <Heading size="4" mb="3">Treatment Plan</Heading>
                    {visit.treatmentPlan.medications && visit.treatmentPlan.medications.length > 0 && (
                      <Box mb="3">
                        <Text size="2" weight="bold" mb="2" as="div">Medications</Text>
                        <Flex direction="column" gap="2">
                          {visit.treatmentPlan.medications.map((med, idx) => (
                            <Card key={idx} variant="surface">
                              <Box p="2">
                                <Text size="2" weight="medium" as="div">{med.name}</Text>
                                <Text size="1" color="gray" as="div">
                                  {med.dosage} • {med.frequency} • {med.duration}
                                </Text>
                                {med.instructions && (
                                  <Text size="1" color="gray" mt="1" as="div">{med.instructions}</Text>
                                )}
                              </Box>
                            </Card>
                          ))}
                        </Flex>
                      </Box>
                    )}
                    {visit.treatmentPlan.followUp && (
                      <Box>
                        <Text size="2" weight="bold" mb="2" as="div">Follow-up</Text>
                        {visit.treatmentPlan.followUp.date && (
                          <Text size="2" as="div">
                            Date: {new Date(visit.treatmentPlan.followUp.date).toLocaleDateString()}
                          </Text>
                        )}
                        {visit.treatmentPlan.followUp.instructions && (
                          <Text size="2" mt="1" style={{ whiteSpace: 'pre-wrap' }} as="div">
                            {visit.treatmentPlan.followUp.instructions}
                          </Text>
                        )}
                        {visit.followUpReminderSent && (
                          <Text size="1" color="green" mt="2" as="div">✓ Reminder sent</Text>
                        )}
                      </Box>
                    )}
                  </Box>
                </Card>
              )}

              {/* Digital Signature */}
              {visit.digitalSignature && (
                <Card>
                  <Box p="3">
                    <Heading size="4" mb="3">Digital Signature</Heading>
                    <Flex align="center" gap="3">
                      <Box
                        style={{
                          border: '2px solid var(--gray-6)',
                          borderRadius: 'var(--radius-2)',
                          padding: '6px',
                          background: 'white',
                        }}
                      >
                        <img
                          src={visit.digitalSignature.signatureData}
                          alt="Signature"
                          style={{ height: '80px', display: 'block' }}
                        />
                      </Box>
                      <Box>
                        <Text size="2" weight="medium" as="div">
                          Signed by: {visit.digitalSignature.providerName}
                        </Text>
                        <Text size="1" color="gray" as="div">
                          {new Date(visit.digitalSignature.signedAt).toLocaleString()}
                        </Text>
                      </Box>
                    </Flex>
                  </Box>
                </Card>
              )}

              {/* Additional Notes */}
              {visit.notes && (
                <Card>
                  <Box p="3">
                    <Heading size="4" mb="3">Additional Notes</Heading>
                    <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{visit.notes}</Text>
                  </Box>
                </Card>
              )}

              {/* Clinical Images/Attachments */}
              <Card>
                <Box p="3">
                  <Flex justify="between" align="center" mb="3">
                    <Heading size="4">Clinical Images & Attachments</Heading>
                  </Flex>
                  
                  {/* File Upload Section */}
                  <FileUploadSection onUpload={handleFileUpload} />

                  {/* Display Attachments */}
                  {visit.attachments && visit.attachments.length > 0 && (
                    <Box mt="4">
                      <Text size="2" weight="bold" mb="3" as="div">Uploaded Files</Text>
                      <Flex gap="3" wrap="wrap">
                        {visit.attachments.map((attachment, idx) => (
                          <Card key={attachment._id || idx} variant="surface" style={{ minWidth: '200px', flex: '1 1 200px' }}>
                            <Box p="3">
                              {attachment.url && attachment.contentType?.startsWith('image/') ? (
                                <Box mb="2">
                                  <img
                                    src={attachment.url}
                                    alt={attachment.filename}
                                    style={{ width: '100%', height: '128px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer' }}
                                    onClick={() => window.open(attachment.url, '_blank')}
                                  />
                                </Box>
                              ) : (
                                <Flex align="center" justify="center" mb="2" style={{ height: '128px', background: 'var(--gray-2)', borderRadius: '6px' }}>
                                  <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gray-9)' }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </Flex>
                              )}
                              <Box>
                                <Text size="2" weight="medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attachment.filename} as="div">
                                  {attachment.filename}
                                </Text>
                                {attachment.notes && (
                                  <Text size="1" color="gray" mt="1" as="div">{attachment.notes}</Text>
                                )}
                                <Text size="1" color="gray" mt="1" as="div">
                                  {new Date(attachment.uploadDate).toLocaleDateString()}
                                  {attachment.size && ` • ${(attachment.size / 1024).toFixed(1)} KB`}
                                </Text>
                                {attachment.url && (
                                  <Button asChild variant="ghost" size="1" mt="1">
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      View/Download
                                    </a>
                                  </Button>
                                )}
                              </Box>
                            </Box>
                          </Card>
                        ))}
                      </Flex>
                    </Box>
                  )}
                </Box>
              </Card>
            </Flex>
          )}
        </Flex>
      </Container>
    </Section>
  );
}

function FileUploadSection({ onUpload }: { onUpload: (file: File, notes?: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const { TextField, Button } = require('@radix-ui/themes');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      await onUpload(file, notes || undefined);
      setFile(null);
      setNotes('');
      // Reset file input
      const fileInput = document.getElementById('visit-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card variant="surface">
      <Box p="3">
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <Box>
              <Text size="2" weight="medium" mb="2" as="div">
                Upload Clinical Image or Document
              </Text>
              <input
                id="visit-file-input"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
                style={{
                  width: '100%',
                  fontSize: 'var(--font-size-2)',
                }}
              />
            </Box>
            <Box>
              <Text size="2" weight="medium" mb="2" as="div">Notes (Optional)</Text>
              <TextField.Root size="2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., X-ray image, wound photo, etc."
                  style={{ all: 'unset', flex: 1 }}
                />
              </TextField.Root>
            </Box>
            <Button
              type="submit"
              disabled={!file || uploading}
              size="2"
              style={{ width: '100%' }}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </Button>
          </Flex>
        </form>
      </Box>
    </Card>
  );
}

