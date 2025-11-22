'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import VisitForm from './VisitForm';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Heading, Callout, IconButton, Container, Section } from '@radix-ui/themes';

interface Visit {
  _id: string;
  visitCode: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  provider?: {
    _id: string;
    name: string;
  };
  date: string;
  visitType: string;
  chiefComplaint?: string;
  diagnoses: Array<{
    code?: string;
    description?: string;
    primary?: boolean;
  }>;
  status: string;
  followUpDate?: string;
  digitalSignature?: {
    providerName: string;
    signedAt: string;
  };
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
}

export default function VisitsPageClient() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [providerName, setProviderName] = useState('Dr. Provider');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
    fetchUser();
  }, []);

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

  const fetchData = async () => {
    try {
      const [visitsRes, patientsRes] = await Promise.all([
        fetch('/api/visits'),
        fetch('/api/patients'),
      ]);

      if (visitsRes.status === 401 || patientsRes.status === 401) {
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

      const visitsData = await parseResponse(visitsRes);
      const patientsData = await parseResponse(patientsRes);

      if (visitsData.success) setVisits(visitsData.data);
      if (patientsData.success) setPatients(patientsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const handleSubmit = async (formData: any) => {
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          date: new Date(),
          followUpDate: formData.followUpDate ? new Date(formData.followUpDate) : undefined,
        }),
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
        showNotification('Failed to create visit: API error', 'error');
        return;
      }

      if (data.success) {
        setShowForm(false);
        fetchData();
        showNotification('Visit created successfully!', 'success');
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to create visit:', error);
      showNotification('Failed to create visit', 'error');
    }
  };

  const filteredVisits = visits.filter(visit => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${visit.patient.firstName} ${visit.patient.lastName}`.toLowerCase();
      const visitCode = visit.visitCode.toLowerCase();
      if (!patientName.includes(query) && !visitCode.includes(query)) return false;
    }
    if (filterStatus !== 'all' && visit.status !== filterStatus) return false;
    return true;
  });

  const getStatusColor = (status: string): 'green' | 'blue' | 'red' | 'gray' => {
    switch (status) {
      case 'closed':
        return 'green';
      case 'open':
        return 'blue';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading visits...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Error/Success Messages */}
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
              <Heading size="8" mb="1">Clinical Visits</Heading>
              <Text size="2" color="gray">Manage consultations and clinical notes</Text>
            </Box>
        <Button
          onClick={() => setShowForm(true)}
          size="3"
        >
          <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Visit
        </Button>
      </Flex>

          {/* Search and Filters */}
          <Card>
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
                  placeholder="Search by patient name or visit code..."
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
                  <Select.Item value="open">Open</Select.Item>
                  <Select.Item value="closed">Closed</Select.Item>
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
          <Dialog.Title>New Clinical Visit</Dialog.Title>
          <Box py="4">
            <VisitForm
              patients={patients}
              onSubmit={handleSubmit}
              onCancel={() => setShowForm(false)}
              providerName={providerName}
            />
          </Box>
        </Dialog.Content>
      </Dialog.Root>

      {/* Visits List */}
      <Card size="2" variant="surface">
        <Box p="3">
          <Flex justify="between" align="center" mb="3">
            <Heading size="3">Visits</Heading>
            <Text size="2" color="gray">
              {filteredVisits.length} {filteredVisits.length === 1 ? 'visit' : 'visits'}
            </Text>
          </Flex>
          {filteredVisits.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterStatus !== 'all' ? 'No visits match your filters' : 'No visits found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first clinical visit to get started'}
              </Text>
              {!searchQuery && filterStatus === 'all' && (
                <Button onClick={() => setShowForm(true)}>
                  <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Visit
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Visit Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Diagnoses</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredVisits.map((visit) => (
                  <Table.Row key={visit._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">{visit.visitCode}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Link href={`/patients/${visit.patient._id}`}>
                        <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                          {visit.patient.firstName} {visit.patient.lastName}
                        </Text>
                      </Link>
                      {visit.patient.patientCode && (
                        <Text size="1" color="gray" as="div">{visit.patient.patientCode}</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2">
                        {new Date(visit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ textTransform: 'capitalize' }}>{visit.visitType}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {visit.diagnoses.length > 0 ? (
                        <Flex direction="column" gap="1">
                          {visit.diagnoses.slice(0, 2).map((diag, idx) => (
                            <Text key={idx} size="1">
                              {diag.code && <Text as="span" style={{ fontFamily: 'monospace' }}>{diag.code}</Text>}
                              {diag.description && ` - ${diag.description}`}
                            </Text>
                          ))}
                          {visit.diagnoses.length > 2 && (
                            <Text size="1" color="gray">+{visit.diagnoses.length - 2} more</Text>
                          )}
                        </Flex>
                      ) : (
                        <Text size="2" color="gray">—</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(visit.status)} size="1">
                        {visit.status}
                      </Badge>
                      {visit.digitalSignature && (
                        <Text size="1" color="green" as="div" mt="1">✓ Signed</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Button asChild size="1" variant="soft" color="blue">
                        <Link href={`/visits/${visit._id}`}>
                          View
                        </Link>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </Card>
        </Flex>
      </Container>
    </Section>
  );
}
