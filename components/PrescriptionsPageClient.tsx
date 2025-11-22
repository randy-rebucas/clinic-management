'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PrescriptionForm from './PrescriptionForm';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tooltip, Heading, Callout, IconButton } from '@radix-ui/themes';

interface Prescription {
  _id: string;
  prescriptionCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  prescribedBy?: {
    _id: string;
    name: string;
  };
  visit?: {
    _id: string;
    visitCode: string;
  };
  medications: Array<{
    name: string;
    dose?: string;
    frequency?: string;
    durationDays?: number;
    quantity?: number;
  }>;
  status: string;
  issuedAt: string;
  pharmacyDispenses?: Array<{
    pharmacyName?: string;
    dispensedAt?: string;
    quantityDispensed?: number;
  }>;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  weight?: number;
}

export default function PrescriptionsPageClient() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    fetchUser();
  }, []);

  const fetchData = async () => {
    try {
      const [prescriptionsRes, patientsRes] = await Promise.all([
        fetch('/api/prescriptions'),
        fetch('/api/patients'),
      ]);

      if (prescriptionsRes.status === 401 || patientsRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false };
      };

      const prescriptionsData = await parseResponse(prescriptionsRes);
      const patientsData = await parseResponse(patientsRes);

      if (prescriptionsData.success) setPrescriptions(prescriptionsData.data);
      if (patientsData.success) setPatients(patientsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const showNotification = (message: string, type: 'error' | 'success') => {
    if (type === 'error') {
      setError(message);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccess(message);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSubmit = async (formData: any) => {
    try {
      const res = await fetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        showNotification('Failed to create prescription: API error', 'error');
        return;
      }

      if (data.success) {
        setShowForm(false);
        fetchData();
        showNotification('Prescription created successfully!', 'success');
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to create prescription:', error);
      showNotification('Failed to create prescription', 'error');
    }
  };

  const filteredPrescriptions = prescriptions.filter(prescription => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${prescription.patient.firstName} ${prescription.patient.lastName}`.toLowerCase();
      const prescriptionCode = prescription.prescriptionCode.toLowerCase();
      const medications = prescription.medications.map(m => m.name.toLowerCase()).join(' ');
      if (!patientName.includes(query) && !prescriptionCode.includes(query) && !medications.includes(query)) return false;
    }
    if (filterStatus !== 'all' && prescription.status !== filterStatus) return false;
    return true;
  });

  const handlePrint = async (prescriptionId: string) => {
    window.open(`/api/prescriptions/${prescriptionId}/print`, '_blank');
  };

  const getStatusColor = (status: string): 'green' | 'yellow' | 'blue' | 'gray' | 'red' => {
    switch (status) {
      case 'dispensed':
        return 'green';
      case 'partially-dispensed':
        return 'yellow';
      case 'active':
        return 'blue';
      case 'completed':
        return 'gray';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading prescriptions...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Error/Success Messages */}
      {error && (
        <Callout.Root color="red" mb="3">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}
      {success && (
        <Callout.Root color="green" mb="3">
          <Callout.Text>{success}</Callout.Text>
        </Callout.Root>
      )}

      {/* Header */}
      <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3" mb="3">
        <Box>
          <Heading size="7" mb="1">E-Prescriptions</Heading>
          <Text size="2" color="gray">Manage prescriptions and track dispensing</Text>
        </Box>
        <Button
          onClick={() => setShowForm(true)}
          size="3"
        >
          <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Prescription
        </Button>
      </Flex>

      {/* Search and Filters */}
      <Card mb="3">
        <Box p="3">
          <Flex direction={{ initial: 'column', sm: 'row' }} gap="3">
            <Box flexGrow="1">
              <TextField.Root size="2" style={{ width: '100%' }}>
                <TextField.Slot>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </TextField.Slot>
                <input
                  type="text"
                  placeholder="Search by patient name, prescription code, or medication..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    all: 'unset', 
                    flex: 1, 
                    width: '100%',
                    padding: '0',
                    fontSize: 'var(--font-size-2)',
                    lineHeight: 'var(--line-height-2)'
                  }}
                />
                {searchQuery && (
                  <TextField.Slot>
                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => setSearchQuery('')}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </IconButton>
                  </TextField.Slot>
                )}
              </TextField.Root>
            </Box>
            <Box style={{ minWidth: '180px' }}>
              <Select.Root
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <Select.Trigger placeholder="All Statuses" />
                <Select.Content>
                  <Select.Item value="all">All Statuses</Select.Item>
                  <Select.Item value="active">Active</Select.Item>
                  <Select.Item value="partially-dispensed">Partially Dispensed</Select.Item>
                  <Select.Item value="dispensed">Dispensed</Select.Item>
                  <Select.Item value="completed">Completed</Select.Item>
                  <Select.Item value="cancelled">Cancelled</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            {(searchQuery || filterStatus !== 'all') && (
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                variant="soft"
                size="2"
              >
                Clear
              </Button>
            )}
          </Flex>
        </Box>
      </Card>

      {/* Form Modal */}
      <Dialog.Root open={showForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
        }
      }}>
        <Dialog.Content style={{ maxWidth: '800px' }}>
          <Dialog.Title>New Prescription</Dialog.Title>
          <Box py="4">
            <PrescriptionForm
              patients={patients}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
              providerName={providerName}
            />
          </Box>
        </Dialog.Content>
      </Dialog.Root>

      {/* Prescriptions List */}
      <Card>
        <Box p="3">
          <Flex justify="between" align="center" mb="3">
            <Heading size="3">Prescriptions</Heading>
            <Text size="2" color="gray">
              {filteredPrescriptions.length} {filteredPrescriptions.length === 1 ? 'prescription' : 'prescriptions'}
            </Text>
          </Flex>
          {filteredPrescriptions.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterStatus !== 'all' ? 'No prescriptions match your filters' : 'No prescriptions found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first prescription to get started'}
              </Text>
              {!searchQuery && filterStatus === 'all' && (
                <Button onClick={() => setShowForm(true)}>
                  <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Prescription
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Prescription Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Medications</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Dispensed</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredPrescriptions.map((prescription) => {
                  const totalPrescribed = prescription.medications.reduce(
                    (sum, m) => sum + (m.quantity || 0),
                    0
                  );
                  const totalDispensed = prescription.pharmacyDispenses?.reduce(
                    (sum, d) => sum + (d.quantityDispensed || 0),
                    0
                  ) || 0;

                  return (
                    <Table.Row key={prescription._id}>
                      <Table.Cell>
                        <Text size="2" weight="medium">{prescription.prescriptionCode}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Link href={`/patients/${prescription.patient._id}`}>
                          <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                            {prescription.patient.firstName} {prescription.patient.lastName}
                          </Text>
                        </Link>
                        {prescription.patient.patientCode && (
                          <Text size="1" color="gray" as="div">{prescription.patient.patientCode}</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          {prescription.medications.slice(0, 2).map((med, idx) => (
                            <Text key={idx} size="1">
                              {med.name} {med.dose && `(${med.dose})`}
                            </Text>
                          ))}
                          {prescription.medications.length > 2 && (
                            <Text size="1" color="gray">+{prescription.medications.length - 2} more</Text>
                          )}
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2">
                          {new Date(prescription.issuedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={getStatusColor(prescription.status)} size="1">
                          {prescription.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {totalDispensed > 0 ? (
                          <Flex direction="column" gap="1">
                            <Text size="1">{totalDispensed} / {totalPrescribed}</Text>
                            {prescription.pharmacyDispenses && prescription.pharmacyDispenses.length > 0 && (
                              <Text size="1" color="gray">
                                {prescription.pharmacyDispenses[0].pharmacyName}
                              </Text>
                            )}
                          </Flex>
                        ) : (
                          <Text size="2" color="gray">—</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell style={{ textAlign: 'right' }}>
                        <Flex gap="2" justify="end">
                          <Tooltip content="Print">
                            <Button
                              onClick={() => handlePrint(prescription._id)}
                              variant="soft"
                              color="blue"
                              size="1"
                            >
                              <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                            </Button>
                          </Tooltip>
                          <Button asChild size="1" variant="soft" color="blue">
                            <Link href={`/prescriptions/${prescription._id}`}>
                              View
                            </Link>
                          </Button>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </Card>
    </Box>
  );
}
