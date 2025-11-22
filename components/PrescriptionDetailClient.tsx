'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Callout, Heading, IconButton, TextArea, Separator, Container, Section } from '@radix-ui/themes';

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
  };
  prescribedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
    date: string;
  };
  medications: Array<{
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
  }>;
  status: string;
  issuedAt: string;
  notes?: string;
  pharmacyDispenses?: Array<{
    pharmacyName?: string;
    pharmacyId?: string;
    dispensedAt?: string;
    dispensedBy?: string;
    quantityDispensed?: number;
    notes?: string;
    trackingNumber?: string;
  }>;
  digitalSignature?: {
    providerName: string;
    signatureData: string;
    signedAt: string;
  };
  drugInteractions?: Array<{
    medication1: string;
    medication2: string;
    severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
    description: string;
    recommendation?: string;
    checkedAt: string;
  }>;
  copies?: {
    patientCopy?: {
      printedAt?: string;
      printedBy?: string;
      digitalCopySent?: boolean;
      sentAt?: string;
    };
    clinicCopy?: {
      archivedAt?: string;
      archivedBy?: string;
      location?: string;
    };
  };
}

export default function PrescriptionDetailClient({ prescriptionId }: { prescriptionId: string }) {
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDispenseForm, setShowDispenseForm] = useState(false);
  const [dispenseForm, setDispenseForm] = useState({
    pharmacyId: '',
    pharmacyName: '',
    quantityDispensed: 0,
    notes: '',
    trackingNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchPrescription();
  }, [prescriptionId]);

  const fetchPrescription = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/prescriptions/${prescriptionId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        setPrescription(data.data);
      } else {
        setError(data.error || 'Failed to load prescription');
      }
    } catch (error) {
      console.error('Failed to fetch prescription:', error);
      setError('Failed to load prescription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleDispense = async () => {
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dispenseForm),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPrescription(data.data);
          setShowDispenseForm(false);
          setDispenseForm({
            pharmacyId: '',
            pharmacyName: '',
            quantityDispensed: 0,
            notes: '',
            trackingNumber: '',
          });
          showNotification('Dispense recorded successfully!', 'success');
        } else {
          showNotification('Error: ' + data.error, 'error');
        }
      } else {
        showNotification('Failed to record dispense', 'error');
      }
    } catch (error) {
      console.error('Failed to record dispense:', error);
      showNotification('Failed to record dispense', 'error');
    }
  };

  const handlePrint = (copyType: 'patient' | 'clinic' = 'patient') => {
    window.open(`/api/prescriptions/${prescriptionId}/print?copy=${copyType}`, '_blank');
  };

  const getInteractionColor = (severity: string): 'red' | 'yellow' | 'blue' => {
    switch (severity) {
      case 'contraindicated':
      case 'severe':
        return 'red';
      case 'moderate':
        return 'yellow';
      default:
        return 'blue';
    }
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading prescription...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }

  if (!prescription) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Heading size="5">{error || 'Prescription not found'}</Heading>
            <Button asChild variant="soft">
              <Link href="/prescriptions">Back to Prescriptions</Link>
            </Button>
          </Flex>
        </Container>
      </Section>
    );
  }

  const totalPrescribed = (prescription.medications || []).reduce(
    (sum, m) => sum + (m.quantity || 0),
    0
  );
  const totalDispensed = (prescription.pharmacyDispenses || []).reduce(
    (sum, d) => sum + (d.quantityDispensed || 0),
    0
  );

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Notifications */}
          {error && (
            <Callout.Root color="red">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {success && (
            <Callout.Root color="green">
              <Callout.Text>{success}</Callout.Text>
            </Callout.Root>
          )}

          {/* Header */}
          <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3">
            <Box>
              <Flex align="center" gap="2" mb="2">
                <IconButton
                  variant="ghost"
                  onClick={() => router.push('/prescriptions')}
                  size="2"
                >
                  <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </IconButton>
                <Heading size="8">Prescription {prescription.prescriptionCode}</Heading>
              </Flex>
          <Flex align="center" gap="2" ml="8">
            {prescription.patient && (
              <>
                <Link href={`/patients/${prescription.patient._id}`}>
                  <Text size="2" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                    {prescription.patient.firstName} {prescription.patient.lastName}
                  </Text>
                </Link>
                <Text size="2" color="gray">•</Text>
              </>
            )}
            {prescription.issuedAt && (
              <Text size="2" color="gray">
                {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </Flex>
        </Box>
        <Flex gap="2" wrap="wrap">
          <Button onClick={() => handlePrint('patient')} size="2">
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Patient Copy
          </Button>
          <Button onClick={() => handlePrint('clinic')} variant="soft" size="2">
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Clinic Copy
          </Button>
          {prescription.status !== 'dispensed' && (
            <Button onClick={() => setShowDispenseForm(true)} color="green" size="2">
              Record Dispense
            </Button>
          )}
        </Flex>
      </Flex>

          <Flex direction="column" gap="3">
            {/* Patient Info */}
            <Card>
              <Box p="3">
                <Heading size="4" mb="3">Patient Information</Heading>
            <Flex direction={{ initial: 'column', md: 'row' }} gap="4" wrap="wrap">
              {prescription.patient && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Name</Text>
                  <Link href={`/patients/${prescription.patient._id}`}>
                    <Text size="2" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                      {prescription.patient.firstName} {prescription.patient.lastName}
                    </Text>
                  </Link>
                </Box>
              )}
              {prescription.patient?.patientCode && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Patient ID</Text>
                  <Text size="2">{prescription.patient.patientCode}</Text>
                </Box>
              )}
              {prescription.patient?.dateOfBirth && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Date of Birth</Text>
                  <Text size="2">{new Date(prescription.patient.dateOfBirth).toLocaleDateString()}</Text>
                </Box>
              )}
              {prescription.patient?.phone && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Phone</Text>
                  <Text size="2">{prescription.patient.phone}</Text>
                </Box>
              )}
              {prescription.issuedAt && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Date Issued</Text>
                  <Text size="2">
                    {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </Box>
              )}
              {prescription.prescribedBy && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Prescribed By</Text>
                  <Text size="2">{prescription.prescribedBy.name}</Text>
                </Box>
              )}
              {prescription.visit && (
                <Box>
                  <Text size="1" color="gray" mb="1" as="div">Visit</Text>
                  <Button asChild variant="ghost" size="1">
                    <Link href={`/visits/${prescription.visit._id}`}>
                      {prescription.visit.visitCode}
                    </Link>
                  </Button>
                </Box>
              )}
            </Flex>
          </Box>
        </Card>

            {/* Medications */}
            <Card>
              <Box p="3">
                <Heading size="4" mb="3">Medications</Heading>
            <Flex direction="column" gap="2">
              {(prescription.medications || []).map((medication, index) => (
                <Card key={index} variant="surface">
                  <Box p="2">
                    <Text size="2" weight="bold" mb="2" as="div">
                      {index + 1}. {medication.name}
                      {medication.genericName && (
                        <Text size="1" color="gray" as="span" ml="2">
                          ({medication.genericName})
                        </Text>
                      )}
                    </Text>
                    <Flex direction={{ initial: 'column', md: 'row' }} gap="3" wrap="wrap" mb="2">
                      {medication.strength && (
                        <Box>
                          <Text size="1" weight="medium">Strength:</Text> <Text size="1">{medication.strength}</Text>
                        </Box>
                      )}
                      {medication.dose && (
                        <Box>
                          <Text size="1" weight="medium">Dose:</Text> <Text size="1">{medication.dose}</Text>
                        </Box>
                      )}
                      {medication.frequency && (
                        <Box>
                          <Text size="1" weight="medium">Frequency:</Text> <Text size="1">{medication.frequency}</Text>
                        </Box>
                      )}
                      {medication.durationDays && (
                        <Box>
                          <Text size="1" weight="medium">Duration:</Text> <Text size="1">{medication.durationDays} day(s)</Text>
                        </Box>
                      )}
                      {medication.quantity && (
                        <Box>
                          <Text size="1" weight="medium">Quantity:</Text> <Text size="1">{medication.quantity}</Text>
                        </Box>
                      )}
                      {medication.form && (
                        <Box>
                          <Text size="1" weight="medium">Form:</Text> <Text size="1">{medication.form}</Text>
                        </Box>
                      )}
                      {medication.route && (
                        <Box>
                          <Text size="1" weight="medium">Route:</Text> <Text size="1">{medication.route}</Text>
                        </Box>
                      )}
                    </Flex>
                    {medication.instructions && (
                      <Box mt="2" pt="2" style={{ borderTop: '1px solid var(--gray-6)' }}>
                        <Text size="1" weight="medium" mb="1" as="div">Instructions:</Text>
                        <Text size="1">{medication.instructions}</Text>
                      </Box>
                    )}
                  </Box>
                </Card>
              ))}
            </Flex>
          </Box>
        </Card>

            {/* Drug Interactions */}
            {prescription.drugInteractions && prescription.drugInteractions.length > 0 && (
              <Card>
                <Box p="3">
                  <Heading size="4" mb="3">Drug Interactions</Heading>
              <Flex direction="column" gap="2">
                {prescription.drugInteractions.map((interaction, idx) => (
                  <Callout.Root key={idx} color={getInteractionColor(interaction.severity)}>
                    <Callout.Text>
                      <Flex justify="between" align="start" gap="3" mb="2">
                        <Text size="2" weight="bold">
                          {interaction.medication1} + {interaction.medication2}
                        </Text>
                        <Badge color={getInteractionColor(interaction.severity)} size="1" variant="solid">
                          {interaction.severity.toUpperCase()}
                        </Badge>
                      </Flex>
                      <Text size="1" mb="1" as="div">{interaction.description}</Text>
                      {interaction.recommendation && (
                        <Text size="1" style={{ fontStyle: 'italic' }} as="div">{interaction.recommendation}</Text>
                      )}
                      {interaction.checkedAt && (
                        <Text size="1" color="gray" mt="2" as="div">
                          Checked: {new Date(interaction.checkedAt).toLocaleString()}
                        </Text>
                      )}
                    </Callout.Text>
                  </Callout.Root>
                ))}
              </Flex>
            </Box>
          </Card>
        )}

            {/* Archive Status */}
            {prescription.copies && (
              <Card>
                <Box p="3">
                  <Heading size="4" mb="3">Archive Status</Heading>
              <Flex direction={{ initial: 'column', md: 'row' }} gap="4">
                {prescription.copies.patientCopy && (
                  <Box>
                    <Heading size="2" mb="2">Patient Copy</Heading>
                    {prescription.copies.patientCopy.printedAt && (
                      <Text size="2" as="div" mb="1">
                        Printed: {new Date(prescription.copies.patientCopy.printedAt).toLocaleString()}
                      </Text>
                    )}
                    {prescription.copies.patientCopy.digitalCopySent && (
                      <Text size="2" as="div">
                        Digital copy sent: {prescription.copies.patientCopy.sentAt
                          ? new Date(prescription.copies.patientCopy.sentAt).toLocaleString()
                          : 'Yes'}
                      </Text>
                    )}
                  </Box>
                )}
                {prescription.copies.clinicCopy && (
                  <Box>
                    <Heading size="2" mb="2">Clinic Copy</Heading>
                    {prescription.copies.clinicCopy.archivedAt && (
                      <Text size="2" as="div" mb="1">
                        Archived: {new Date(prescription.copies.clinicCopy.archivedAt).toLocaleString()}
                      </Text>
                    )}
                    {prescription.copies.clinicCopy.location && (
                      <Text size="2" as="div">
                        Location: {prescription.copies.clinicCopy.location}
                      </Text>
                    )}
                  </Box>
                )}
              </Flex>
            </Box>
          </Card>
        )}

            {/* Dispensing Status */}
            <Card>
              <Box p="3">
                <Heading size="4" mb="3">Dispensing Status</Heading>
            <Flex direction="column" gap="2" mb="3">
              <Flex justify="between" align="center">
                <Text size="1" color="gray">Prescribed</Text>
                <Text size="2" weight="medium">{totalPrescribed}</Text>
              </Flex>
              <Flex justify="between" align="center">
                <Text size="1" color="gray">Dispensed</Text>
                <Text size="2" weight="medium">{totalDispensed}</Text>
              </Flex>
              <Box style={{ width: '100%', height: '8px', background: 'var(--gray-6)', borderRadius: '9999px', overflow: 'hidden' }}>
                <Box
                  style={{
                    height: '100%',
                    background: 'var(--blue-9)',
                    width: `${totalPrescribed > 0 ? (totalDispensed / totalPrescribed) * 100 : 0}%`,
                    transition: 'width 0.3s ease',
                  }}
                />
              </Box>
            </Flex>
            {(prescription.pharmacyDispenses || []).length > 0 && (
              <Flex direction="column" gap="2">
                <Heading size="2" mb="1">Dispense History</Heading>
                {(prescription.pharmacyDispenses || []).map((dispense, index) => (
                  <Card key={index} variant="surface">
                    <Box p="2">
                      <Flex justify="between" align="start" gap="3">
                        <Box>
                          <Text size="2" weight="medium" as="div">
                            {dispense.pharmacyName || 'Pharmacy'}
                          </Text>
                          {dispense.dispensedAt && (
                            <Text size="1" color="gray" as="div">
                              {new Date(dispense.dispensedAt).toLocaleDateString()}
                            </Text>
                          )}
                          {dispense.quantityDispensed && (
                            <Text size="1" color="gray" mt="1" as="div">
                              Quantity: {dispense.quantityDispensed}
                            </Text>
                          )}
                        </Box>
                        {dispense.trackingNumber && (
                          <Text size="1" color="gray">#{dispense.trackingNumber}</Text>
                        )}
                      </Flex>
                      {dispense.notes && (
                        <Text size="1" mt="2" as="div">{dispense.notes}</Text>
                      )}
                    </Box>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>
        </Card>

            {/* Notes */}
            {prescription.notes && (
              <Card>
                <Box p="3">
                  <Heading size="4" mb="3">Notes</Heading>
              <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{prescription.notes}</Text>
            </Box>
          </Card>
        )}

            {/* Digital Signature */}
            {prescription.digitalSignature && (
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
                    src={prescription.digitalSignature.signatureData}
                    alt="Signature"
                    style={{ height: '64px', display: 'block' }}
                  />
                </Box>
                <Box>
                  <Text size="2" weight="medium" as="div">
                    {prescription.digitalSignature.providerName}
                  </Text>
                  <Text size="1" color="gray" as="div">
                    {new Date(prescription.digitalSignature.signedAt).toLocaleString()}
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Card>
        )}
      </Flex>

          {/* Dispense Form Modal */}
      <Dialog.Root open={showDispenseForm} onOpenChange={(open) => {
        if (!open) {
          setShowDispenseForm(false);
        }
      }}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Record Dispense</Dialog.Title>
          <Box py="4">
            <Flex direction="column" gap="3">
              <Box>
                <Text size="1" weight="medium" mb="1" as="div">Pharmacy Name <Text color="red">*</Text></Text>
                <TextField.Root size="2" style={{ width: '100%' }}>
                  <input
                    type="text"
                    required
                    value={dispenseForm.pharmacyName}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, pharmacyName: e.target.value })}
                    style={{ 
                      all: 'unset', 
                      flex: 1, 
                      width: '100%',
                      padding: '0',
                      fontSize: 'var(--font-size-2)',
                      lineHeight: 'var(--line-height-2)'
                    }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="1" weight="medium" mb="1" as="div">Quantity Dispensed <Text color="red">*</Text></Text>
                <TextField.Root size="2" style={{ width: '100%' }}>
                  <input
                    type="number"
                    required
                    min="1"
                    max={totalPrescribed - totalDispensed}
                    value={dispenseForm.quantityDispensed}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, quantityDispensed: parseInt(e.target.value) || 0 })}
                    style={{ 
                      all: 'unset', 
                      flex: 1, 
                      width: '100%',
                      padding: '0',
                      fontSize: 'var(--font-size-2)',
                      lineHeight: 'var(--line-height-2)'
                    }}
                  />
                </TextField.Root>
                <Text size="1" color="gray" mt="1" as="div">
                  Remaining: {totalPrescribed - totalDispensed}
                </Text>
              </Box>
              <Box>
                <Text size="1" weight="medium" mb="1" as="div">Tracking Number</Text>
                <TextField.Root size="2" style={{ width: '100%' }}>
                  <input
                    type="text"
                    value={dispenseForm.trackingNumber}
                    onChange={(e) => setDispenseForm({ ...dispenseForm, trackingNumber: e.target.value })}
                    style={{ 
                      all: 'unset', 
                      flex: 1, 
                      width: '100%',
                      padding: '0',
                      fontSize: 'var(--font-size-2)',
                      lineHeight: 'var(--line-height-2)'
                    }}
                  />
                </TextField.Root>
              </Box>
              <Box>
                <Text size="1" weight="medium" mb="1" as="div">Notes</Text>
                <TextArea
                  size="2"
                  value={dispenseForm.notes}
                  onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })}
                  rows={3}
                  style={{ width: '100%' }}
                />
              </Box>
              <Flex justify="end" gap="3" pt="2">
                <Dialog.Close>
                  <Button variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button onClick={handleDispense} color="green">
                  Record Dispense
                </Button>
              </Flex>
            </Flex>
          </Box>
        </Dialog.Content>
      </Dialog.Root>
        </Flex>
      </Container>
    </Section>
  );
}
