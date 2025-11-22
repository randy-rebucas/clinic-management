'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Callout, Tooltip, IconButton, Separator, Popover, Skeleton, Heading, AlertDialog, Container, Section } from '@radix-ui/themes';

interface Queue {
  _id: string;
  queueNumber: string;
  queueType: 'appointment' | 'walk-in' | 'follow-up';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    patientCode?: string;
  };
  doctor?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  room?: {
    _id: string;
    name: string;
    roomNumber?: string;
  };
  patientName: string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  queuedAt: string;
  checkedIn: boolean;
  estimatedWaitTime?: number;
  priority?: number;
  position?: number;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

export default function QueuePageClient() {
  const [queue, setQueue] = useState<Queue[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active'); // 'active' | 'all'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{id: string, action: string, patientName: string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    patientId: '',
    doctorId: '',
    queueType: 'walk-in' as 'appointment' | 'walk-in' | 'follow-up',
    priority: 0,
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchDoctors();
    fetchPatients();
    fetchQueue();
    const interval = setInterval(fetchQueue, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (formData.patientId) {
      const patient = patients.find((p) => p._id === formData.patientId);
      setSelectedPatient(patient || null);
      if (patient) {
        setPatientSearch(`${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}`);
      }
    }
  }, [formData.patientId, patients]);

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

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctors(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    }
  };

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/patients');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPatients(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    }
  };

  const fetchQueue = async (showRefreshing = false) => {
    try {
      if (showRefreshing) setRefreshing(true);
      
      let url = '/api/queue';
      const params = new URLSearchParams();
      if (filterDoctor) params.append('doctorId', filterDoctor);
      if (filterStatus === 'active') params.append('status', 'waiting,in-progress');
      if (params.toString()) url += '?' + params.toString();
      
      const res = await fetch(url);
      
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        data = { success: false, error: `API error: ${res.status} ${res.statusText}` };
      }
      
      if (data.success) {
        let filteredData = data.data;
        if (filterType) {
          filteredData = filteredData.filter((q: Queue) => q.queueType === filterType);
        }
        setQueue(filteredData);
      } else {
        console.error('Failed to fetch queue:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
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

  const handleStatusUpdate = async (queueId: string, newStatus: string, patientName?: string) => {
    // Show confirmation for destructive actions
    if (newStatus === 'cancelled' || newStatus === 'no-show') {
      setConfirmAction({ id: queueId, action: newStatus, patientName: patientName || 'patient' });
      return;
    }

    await performStatusUpdate(queueId, newStatus);
  };

  const performStatusUpdate = async (queueId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/queue/${queueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        showNotification(`Status updated to ${newStatus}`, 'success');
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to update queue status:', error);
      showNotification('Failed to update queue status', 'error');
    }
  };

  const handleCheckIn = async (queueId: string) => {
    try {
      const res = await fetch('/api/queue/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        showNotification('Patient checked in successfully', 'success');
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to check in patient:', error);
      showNotification('Failed to check in patient', 'error');
    }
  };

  const filteredPatients = patients.filter((patient) => {
    if (!patientSearch.trim()) return true;
    const searchLower = patientSearch.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName} ${patient.patientCode || ''}`.toLowerCase();
    return fullName.includes(searchLower);
  });

  const selectPatient = (patient: Patient) => {
    setFormData({ ...formData, patientId: patient._id });
    setSelectedPatient(patient);
    setPatientSearch(`${patient.firstName} ${patient.lastName}${patient.patientCode ? ` (${patient.patientCode})` : ''}`);
    setShowPatientSearch(false);
  };

  const handleAddToQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patientId || !selectedPatient) {
      showNotification('Please select a valid patient', 'error');
      setShowPatientSearch(true);
      return;
    }

    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: formData.patientId,
          doctorId: formData.doctorId || undefined,
          queueType: formData.queueType,
          priority: formData.priority,
        }),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        showNotification('Patient added to queue successfully', 'success');
        setShowAddForm(false);
        setFormData({ patientId: '', doctorId: '', queueType: 'walk-in', priority: 0 });
        setPatientSearch('');
        setSelectedPatient(null);
        fetchQueue();
      } else {
        showNotification('Error: ' + data.error, 'error');
      }
    } catch (error) {
      console.error('Failed to add patient to queue:', error);
      showNotification('Failed to add patient to queue', 'error');
    }
  };

  const calculateWaitTime = (queuedAt: string) => {
    const queued = new Date(queuedAt);
    const now = new Date();
    const diffMs = now.getTime() - queued.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in-progress':
        return 'blue';
      case 'waiting':
        return 'yellow';
      case 'cancelled':
      case 'no-show':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getTypeColor = (type: string): 'blue' | 'purple' | 'green' | 'gray' => {
    switch (type) {
      case 'appointment':
        return 'blue';
      case 'walk-in':
        return 'purple';
      case 'follow-up':
        return 'green';
      default:
        return 'gray';
    }
  };

  useEffect(() => {
    fetchQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDoctor, filterStatus]);

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" gap="3">
            <Skeleton height="32px" width="200px" />
            <Skeleton height="40px" />
            <Skeleton height="400px" />
          </Flex>
        </Container>
      </Section>
    );
  }

  const filteredQueue = queue.filter(q => {
    if (filterType && q.queueType !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = (q.patientName || `${q.patient?.firstName} ${q.patient?.lastName}`).toLowerCase();
      const queueNumber = q.queueNumber.toLowerCase();
      if (!patientName.includes(query) && !queueNumber.includes(query)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Sort by priority first, then by queued time
    if (a.priority !== undefined && b.priority !== undefined) {
      if (a.priority !== b.priority) return a.priority - b.priority;
    }
    return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
  });

  const activeQueue = filteredQueue.filter(q => q.status === 'waiting' || q.status === 'in-progress');

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
              <Heading size="8" mb="1">Queue Management</Heading>
              <Text size="2" color="gray">Monitor patient queue and flow</Text>
            </Box>
        <Flex align="center" gap="2" wrap="wrap">
          <Button
            onClick={() => setShowAddForm(true)}
            size="3"
            color="blue"
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add to Queue
          </Button>
          <Button
            onClick={() => fetchQueue(true)}
            disabled={refreshing}
            variant="soft"
            size="3"
            color="gray"
          >
            {refreshing ? (
              <Spinner size="1" style={{ marginRight: '6px' }} />
            ) : (
              <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Text size="1" color="gray" className="hidden sm:block">
            Auto-refreshes every 30s
          </Text>
        </Flex>
      </Flex>

          {/* Search */}
          <Card>
            <Box p="2">
          <TextField.Root size="2" style={{ width: '100%' }}>
            <TextField.Slot>
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </TextField.Slot>
            <input
              type="text"
              placeholder="Search by patient name or queue number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ all: 'unset', flex: 1 }}
            />
            {searchQuery && (
              <TextField.Slot>
                <Button
                  variant="ghost"
                  size="1"
                  onClick={() => setSearchQuery('')}
                  style={{ cursor: 'pointer', padding: '4px' }}
                >
                  <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </TextField.Slot>
            )}
          </TextField.Root>
        </Box>
      </Card>

          {/* Stats Cards */}
          <Flex gap="2" wrap="wrap">
        <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
          <Box p="2">
            <Text size="1" color="gray" mb="1" as="div">Waiting</Text>
            <Text size="6" weight="bold" color="yellow">
              {queue.filter(q => q.status === 'waiting').length}
            </Text>
          </Box>
        </Card>
        <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
          <Box p="2">
            <Text size="1" color="gray" mb="1" as="div">In Progress</Text>
            <Text size="6" weight="bold" color="blue">
              {queue.filter(q => q.status === 'in-progress').length}
            </Text>
          </Box>
        </Card>
        <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
          <Box p="2">
            <Text size="1" color="gray" mb="1" as="div">Not Checked In</Text>
            <Text size="6" weight="bold" color="orange">
              {queue.filter(q => !q.checkedIn && (q.status === 'waiting' || q.status === 'in-progress')).length}
            </Text>
          </Box>
        </Card>
        <Card style={{ flex: '1 1 150px', minWidth: '120px' }}>
          <Box p="2">
            <Text size="1" color="gray" mb="1" as="div">Total Active</Text>
            <Text size="6" weight="bold">
              {activeQueue.length}
            </Text>
          </Box>
        </Card>
      </Flex>

          {/* Filters */}
          <Card>
            <Box p="3">
          <Flex direction={{ initial: 'column', sm: 'row' }} gap="3" wrap="wrap">
            <Box style={{ flex: '1 1 200px' }}>
              <Text size="1" weight="medium" mb="1" as="div">Doctor</Text>
              <Select.Root
                value={filterDoctor || undefined}
                onValueChange={(value) => setFilterDoctor(value === 'all' ? '' : value)}
              >
                <Select.Trigger placeholder="All Doctors" />
                <Select.Content>
                  <Select.Item value="all">All Doctors</Select.Item>
                  {doctors.map((doctor) => (
                    <Select.Item key={doctor._id} value={doctor._id}>
                      Dr. {doctor.firstName} {doctor.lastName}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
            <Box style={{ flex: '1 1 200px' }}>
              <Text size="1" weight="medium" mb="1" as="div">Queue Type</Text>
              <Select.Root
                value={filterType || undefined}
                onValueChange={(value) => setFilterType(value === 'all' ? '' : value)}
              >
                <Select.Trigger placeholder="All Types" />
                <Select.Content>
                  <Select.Item value="all">All Types</Select.Item>
                  <Select.Item value="appointment">Appointment</Select.Item>
                  <Select.Item value="walk-in">Walk-In</Select.Item>
                  <Select.Item value="follow-up">Follow-Up</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            <Box style={{ flex: '1 1 200px' }}>
              <Text size="1" weight="medium" mb="1" as="div">Status</Text>
              <Select.Root
                value={filterStatus}
                onValueChange={setFilterStatus}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="active">Active Only</Select.Item>
                  <Select.Item value="all">All Statuses</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
          </Flex>
          {(filterDoctor || filterType || filterStatus !== 'active') && (
            <Box mt="3" pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
              <Button
                onClick={() => {
                  setFilterDoctor('');
                  setFilterType('');
                  setFilterStatus('active');
                }}
                variant="ghost"
                size="1"
                color="gray"
              >
                <svg style={{ width: '12px', height: '12px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear filters
              </Button>
            </Box>
          )}
        </Box>
      </Card>

          {/* Queue Table */}
          <Card>
            <Box p="3" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Flex justify="between" align="center">
                <Heading size="4">Current Queue</Heading>
            <Text size="1" color="gray">
              {filteredQueue.length} {filteredQueue.length === 1 ? 'patient' : 'patients'}
            </Text>
          </Flex>
        </Box>
        {filteredQueue.length === 0 ? (
          <Box p="8" style={{ textAlign: 'center' }}>
            <Box mb="2">
              <svg style={{ width: '40px', height: '40px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </Box>
            <Heading size="4" mb="1">
              {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                ? 'No patients match your filters' 
                : 'No patients in queue'}
            </Heading>
            <Text size="2" color="gray" mb="3" as="div">
              {searchQuery || filterDoctor || filterType || filterStatus !== 'active' 
                ? 'Try adjusting your search or filters' 
                : 'Add a patient to get started'}
            </Text>
            {!searchQuery && !filterDoctor && !filterType && filterStatus === 'active' && (
              <Button
                onClick={() => setShowAddForm(true)}
                size="2"
                color="blue"
              >
                <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Patient
              </Button>
            )}
          </Box>
        ) : (
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Queue #</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Doctor / Room</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Wait Time</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Checked In</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredQueue.map((item) => (
                <Table.Row 
                  key={item._id}
                  style={item.status === 'in-progress' ? { background: 'var(--blue-2)' } : undefined}
                >
                  <Table.Cell>
                    <Text size="2" weight="bold">{item.queueNumber}</Text>
                    {item.priority !== undefined && item.priority < 3 && (
                      <Badge size="1" color="orange" variant="soft" mt="1">Priority</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={getTypeColor(item.queueType)} size="1">
                      {item.queueType}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Link href={`/patients/${item.patient._id}`}>
                      <Text size="2" weight="medium" color="blue" as="div">
                        {item.patientName || `${item.patient?.firstName} ${item.patient?.lastName}`}
                      </Text>
                    </Link>
                    <Text size="1" color="gray" mt="1" as="div">
                      {new Date(item.queuedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    {item.doctor ? (
                      <Text size="1" as="div">Dr. {item.doctor.firstName} {item.doctor.lastName}</Text>
                    ) : (
                      <Text size="1" color="gray" as="div">Not assigned</Text>
                    )}
                    {item.room && (
                      <Text size="1" color="blue" mt="1" as="div">Room: {item.room.name || item.room.roomNumber}</Text>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={getStatusColor(item.status)} size="1">
                      {item.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    {item.estimatedWaitTime !== undefined && (
                      <Text size="1" as="div">Est: {item.estimatedWaitTime}m</Text>
                    )}
                    <Text size="1" color="gray" mt="1" as="div">
                      {calculateWaitTime(item.queuedAt)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    {item.checkedIn ? (
                      <Badge color="green" size="1">✓</Badge>
                    ) : (
                      <Button
                        onClick={() => handleCheckIn(item._id)}
                        size="1"
                        variant="ghost"
                        color="orange"
                      >
                        Check In
                      </Button>
                    )}
                  </Table.Cell>
                  <Table.Cell style={{ textAlign: 'right' }}>
                    <Flex gap="1" justify="end">
                      {item.status === 'waiting' && (
                        <>
                          <Tooltip content="Start">
                            <Button
                              onClick={() => handleStatusUpdate(item._id, 'in-progress')}
                              size="1"
                              variant="soft"
                              color="blue"
                            >
                              Start
                            </Button>
                          </Tooltip>
                          <Tooltip content="Cancel">
                            <Button
                              onClick={() => handleStatusUpdate(item._id, 'cancelled', item.patientName)}
                              size="1"
                              variant="soft"
                              color="red"
                            >
                              Cancel
                            </Button>
                          </Tooltip>
                        </>
                      )}
                      {item.status === 'in-progress' && (
                        <>
                          <Tooltip content="Complete">
                            <Button
                              onClick={() => handleStatusUpdate(item._id, 'completed')}
                              size="1"
                              variant="soft"
                              color="green"
                            >
                              Done
                            </Button>
                          </Tooltip>
                          <Tooltip content="No-Show">
                            <Button
                              onClick={() => handleStatusUpdate(item._id, 'no-show', item.patientName)}
                              size="1"
                              variant="soft"
                              color="yellow"
                            >
                              No-Show
                            </Button>
                          </Tooltip>
                        </>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Card>

          {/* Add to Queue Modal */}
          <Dialog.Root open={showAddForm} onOpenChange={(open) => {
        setShowAddForm(open);
        if (!open) {
          setPatientSearch('');
          setSelectedPatient(null);
          setFormData({ ...formData, patientId: '' });
        }
      }}>
        <Dialog.Content style={{ maxWidth: '500px' }}>
          <Dialog.Title>Add Patient to Queue</Dialog.Title>
          <Dialog.Description mb="4">
            Add a new patient to the queue system
          </Dialog.Description>
          <form onSubmit={handleAddToQueue}>
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Patient <Text color="red">*</Text></Text>
                <Popover.Root open={showPatientSearch} onOpenChange={setShowPatientSearch}>
                  <Popover.Anchor>
                    <TextField.Root size="2" style={{ width: '100%' }}>
                      <input
                        type="text"
                        required
                        value={patientSearch}
                        onChange={(e) => {
                          setPatientSearch(e.target.value);
                          setShowPatientSearch(true);
                          if (!e.target.value) {
                            setFormData({ ...formData, patientId: '' });
                            setSelectedPatient(null);
                          }
                        }}
                        onFocus={() => setShowPatientSearch(true)}
                        placeholder="Type to search patients..."
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
                  </Popover.Anchor>
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
                            <Text weight="medium" size="2">{patient.firstName} {patient.lastName}</Text>
                            {patient.patientCode && (
                              <Text size="1" color="gray">{patient.patientCode}</Text>
                            )}
                          </Button>
                        ))}
                      </Flex>
                    ) : patientSearch ? (
                      <Text size="2" color="gray">No patients found</Text>
                    ) : (
                      <Text size="2" color="gray">Start typing to search...</Text>
                    )}
                  </Popover.Content>
                </Popover.Root>
                {formData.patientId && !selectedPatient && (
                  <Text size="1" color="red" mt="1" as="div">Please select a valid patient from the list</Text>
                )}
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Doctor (Optional)</Text>
                <Select.Root
                  value={formData.doctorId || undefined}
                  onValueChange={(value) => setFormData({ ...formData, doctorId: value === 'none' ? '' : value })}
                >
                  <Select.Trigger placeholder="No doctor assigned" />
                  <Select.Content>
                    <Select.Item value="none">No doctor assigned</Select.Item>
                    {doctors.map((doctor) => (
                      <Select.Item key={doctor._id} value={doctor._id}>
                        Dr. {doctor.firstName} {doctor.lastName}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Queue Type <Text color="red">*</Text></Text>
                <Select.Root
                  value={formData.queueType}
                  onValueChange={(value) => setFormData({ ...formData, queueType: value as any })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="walk-in">Walk-In</Select.Item>
                    <Select.Item value="appointment">Appointment</Select.Item>
                    <Select.Item value="follow-up">Follow-Up</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Priority</Text>
                <Select.Root
                  value={formData.priority.toString()}
                  onValueChange={(value) => setFormData({ ...formData, priority: parseInt(value) })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="0">Normal</Select.Item>
                    <Select.Item value="1">High</Select.Item>
                    <Select.Item value="2">Urgent</Select.Item>
                  </Select.Content>
                </Select.Root>
                <Text size="1" color="gray" mt="1" as="div">Lower number = higher priority</Text>
              </Box>
              <Flex gap="2" justify="end" pt="2">
                <Dialog.Close>
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    onClick={() => {
                      setPatientSearch('');
                      setSelectedPatient(null);
                      setFormData({ ...formData, patientId: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" color="blue">
                  Add to Queue
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>

          {/* Confirmation Dialog */}
          <AlertDialog.Root open={!!confirmAction} onOpenChange={(open) => {
        if (!open) setConfirmAction(null);
      }}>
        <AlertDialog.Content style={{ maxWidth: '450px' }}>
          <AlertDialog.Title>Confirm Action</AlertDialog.Title>
          <AlertDialog.Description>
            Are you sure you want to mark <strong>{confirmAction?.patientName}</strong> as <strong>{confirmAction?.action}</strong>?
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                color={confirmAction?.action === 'cancelled' ? 'red' : 'yellow'}
                onClick={() => {
                  if (confirmAction) {
                    performStatusUpdate(confirmAction.id, confirmAction.action);
                    setConfirmAction(null);
                  }
                }}
              >
                Confirm
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
        </Flex>
      </Container>
    </Section>
  );
}

