'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Callout, Heading, IconButton, Container, Section } from '@radix-ui/themes';

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  licenseNumber: string;
  title?: string;
  department?: string;
  status?: 'active' | 'inactive' | 'on-leave';
  schedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
  };
}

export default function DoctorsPageClient() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'roster' | 'performance'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialization: '',
    licenseNumber: '',
    title: '',
    department: '',
    status: 'active' as const,
    schedule: [] as Array<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }>,
  });
  const router = useRouter();

  useEffect(() => {
    fetchDoctors();
  }, []);

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors');
      
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
        setDoctors(data.data);
      } else {
        console.error('Failed to fetch doctors:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/doctors', {
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
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        setError('Failed to create doctor: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }
      if (data.success) {
        setShowForm(false);
        setFormData({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          specialization: '',
          licenseNumber: '',
          title: '',
          department: '',
          status: 'active',
          schedule: [],
        });
        setSuccess('Doctor added successfully!');
        setTimeout(() => setSuccess(null), 3000);
        fetchDoctors();
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to create doctor:', error);
      setError('Failed to create doctor');
      setTimeout(() => setError(null), 5000);
    }
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };


  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading doctors...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }

  const filteredDoctors = doctors.filter(doctor => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = `${doctor.firstName} ${doctor.lastName}`.toLowerCase();
      const specialization = (doctor.specialization || '').toLowerCase();
      const email = (doctor.email || '').toLowerCase();
      if (!name.includes(query) && !specialization.includes(query) && !email.includes(query)) return false;
    }
    if (filterStatus !== 'all' && doctor.status !== filterStatus) return false;
    return true;
  });

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Notifications */}
          {error && (
            <Callout.Root color="red" size="2">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {success && (
            <Callout.Root color="green" size="2">
              <Callout.Text>{success}</Callout.Text>
            </Callout.Root>
          )}

          {/* Header */}
          <Flex justify="between" align={{ sm: 'center' }} direction={{ initial: 'column', sm: 'row' }} gap="3">
            <Box>
              <Heading size="8" mb="1">Doctors & Staff</Heading>
              <Text size="2" color="gray">Manage doctor profiles, schedules, and performance</Text>
            </Box>
            <Button onClick={() => setShowForm(true)} size="3">
              Add Doctor
            </Button>
          </Flex>

          {/* View Mode Tabs */}
          <Card size="2" variant="surface">
            <Tabs.Root value={viewMode} onValueChange={(value) => setViewMode(value as any)}>
              <Tabs.List>
                <Tabs.Trigger value="list">Doctor Profiles</Tabs.Trigger>
                <Tabs.Trigger value="roster">Duty Roster</Tabs.Trigger>
                <Tabs.Trigger value="performance">Performance Reports</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          </Card>

      {/* Form Modal */}
      <Dialog.Root open={showForm} onOpenChange={(open) => {
        if (!open) setShowForm(false);
      }}>
        <Dialog.Content style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
          <Dialog.Title>Add New Doctor</Dialog.Title>
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="3" py="4">
              <Flex direction={{ initial: 'column', md: 'row' }} gap="2" wrap="wrap">
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Title</Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="Dr., Prof., etc."
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">First Name <Text color="red">*</Text></Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      required
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Last Name <Text color="red">*</Text></Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Email <Text color="red">*</Text></Text>
                  <TextField.Root size="2" type="email">
                    <input
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Phone <Text color="red">*</Text></Text>
                  <TextField.Root size="2" type="tel">
                    <input
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Specialization <Text color="red">*</Text></Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      required
                      value={formData.specialization}
                      onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">License Number <Text color="red">*</Text></Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      required
                      value={formData.licenseNumber}
                      onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Department</Text>
                  <TextField.Root size="2">
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      style={{ all: 'unset', flex: 1 }}
                    />
                  </TextField.Root>
                </Box>
                <Box flexGrow="1" minWidth="200px">
                  <Text size="1" weight="medium" mb="1" as="div">Status</Text>
                  <Select.Root
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                    size="2"
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="active">Active</Select.Item>
                      <Select.Item value="inactive">Inactive</Select.Item>
                      <Select.Item value="on-leave">On Leave</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Box>
              </Flex>
              <Flex justify="end" gap="2" pt="3" style={{ borderTop: '1px solid var(--gray-6)' }}>
                <Button type="button" onClick={() => setShowForm(false)} variant="soft" size="2">
                  Cancel
                </Button>
                <Button type="submit" size="2">
                  Add Doctor
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* Search and Filters */}
          <Card>
            <Flex direction="column" gap="2" p="3">
              <TextField.Root size="2">
                <TextField.Slot side="left">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </TextField.Slot>
                <input
                  type="text"
                  placeholder="Search by name, specialization, or email..."
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value || '')}
                  style={{ all: 'unset', flex: 1 }}
                />
                {searchQuery && (
                  <TextField.Slot side="right">
                    <IconButton
                      variant="ghost"
                      size="1"
                      onClick={() => setSearchQuery('')}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    </IconButton>
                  </TextField.Slot>
                )}
              </TextField.Root>
              <Flex gap="2">
                <Select.Root
                  value={filterStatus || 'all'}
                  onValueChange={(value) => setFilterStatus(value || 'all')}
                  size="1"
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="all">All Statuses</Select.Item>
                    <Select.Item value="active">Active</Select.Item>
                    <Select.Item value="inactive">Inactive</Select.Item>
                    <Select.Item value="on-leave">On Leave</Select.Item>
                  </Select.Content>
                </Select.Root>
                {(searchQuery || filterStatus !== 'all') && (
                  <Button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterStatus('all');
                    }}
                    variant="soft"
                    size="1"
                  >
                    Clear
                  </Button>
                )}
              </Flex>
            </Flex>
          </Card>

          <Card>
            <Flex justify="between" align="center" p="2" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Heading size="3">Doctors</Heading>
              <Text size="2" color="gray">
                {filteredDoctors.length} {filteredDoctors.length === 1 ? 'doctor' : 'doctors'}
              </Text>
            </Flex>
            {filteredDoctors.length === 0 ? (
              <Box p="6" style={{ textAlign: 'center' }}>
                <Text size="5" color="gray" mb="2" as="div">👨‍⚕️</Text>
                <Heading size="4" mb="1">
                  {searchQuery || filterStatus !== 'all' ? 'No doctors match your filters' : 'No doctors found'}
                </Heading>
                <Text size="2" color="gray" mb="2" as="div">
                  {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Get started by adding your first doctor'}
                </Text>
                {!searchQuery && filterStatus === 'all' && (
                  <Button onClick={() => setShowForm(true)} size="2">
                    Add First Doctor
                  </Button>
                )}
              </Box>
            ) : (
              <Flex direction="column">
                {filteredDoctors.map((doctor) => (
                  <Card key={doctor._id} size="1" style={{ borderRadius: 0, borderTop: '1px solid var(--gray-6)' }}>
                    <Flex justify="between" align="start">
                      <Flex align="start" gap="2" style={{ flex: 1 }}>
                        <Box
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--blue-9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            flexShrink: 0,
                          }}
                        >
                          {doctor.firstName.charAt(0)}{doctor.lastName.charAt(0)}
                        </Box>
                        <Box style={{ flex: 1 }}>
                          <Flex align="center" gap="2" mb="1">
                            <Text size="2" weight="bold">
                              {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                            </Text>
                            <Badge
                              color={
                                doctor.status === 'active'
                                  ? 'green'
                                  : doctor.status === 'inactive'
                                  ? 'gray'
                                  : 'yellow'
                              }
                              size="1"
                            >
                              {doctor.status || 'active'}
                            </Badge>
                          </Flex>
                          <Text size="1" color="gray">{doctor.specialization}</Text>
                          {doctor.department && (
                            <Text size="1" color="gray">{doctor.department}</Text>
                          )}
                          <Flex direction="column" gap="0.5" mt="1">
                            <Text size="1" color="gray">{doctor.email}</Text>
                            <Text size="1" color="gray">{doctor.phone}</Text>
                            <Text size="1" color="gray">License: {doctor.licenseNumber}</Text>
                            {doctor.schedule && doctor.schedule.length > 0 && (
                              <Box mt="1">
                                <Text size="1" weight="medium" mb="1" as="div">Schedule:</Text>
                                <Flex gap="1" wrap="wrap">
                                  {doctor.schedule
                                    .filter((s) => s.isAvailable)
                                    .map((s, idx) => (
                                      <Badge key={idx} size="1" color="blue">
                                        {getDayName(s.dayOfWeek).substring(0, 3)} {formatTime(s.startTime)}-{formatTime(s.endTime)}
                                      </Badge>
                                    ))}
                                </Flex>
                              </Box>
                            )}
                          </Flex>
                        </Box>
                      </Flex>
                      <Button asChild variant="soft" color="blue" size="1">
                        <Link href={`/doctors/${doctor._id}`}>View →</Link>
                      </Button>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            )}
          </Card>
          </>
        )}

      {/* Roster View */}
      {viewMode === 'roster' && (
        <Card>
          <Box style={{ overflowX: 'auto' }}>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Doctor</Table.ColumnHeaderCell>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <Table.ColumnHeaderCell key={day} style={{ textAlign: 'center' }}>
                      {day}
                    </Table.ColumnHeaderCell>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {doctors.filter(d => d.status === 'active').map((doctor) => (
                  <Table.Row key={doctor._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">
                        {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                      </Text>
                      <Text size="1" color="gray">{doctor.specialization}</Text>
                    </Table.Cell>
                    {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                      const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                      return (
                        <Table.Cell key={day} style={{ textAlign: 'center' }}>
                          {schedule && schedule.isAvailable ? (
                            <Text size="1" color="green" weight="medium">
                              {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                            </Text>
                          ) : (
                            <Text size="1" color="gray">—</Text>
                          )}
                        </Table.Cell>
                      );
                    })}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        </Card>
      )}

      {/* Performance View */}
      {viewMode === 'performance' && (
        <Flex direction="column" gap="2">
          {doctors.map((doctor) => {
            const metrics = doctor.performanceMetrics;
            const total = metrics?.totalAppointments || 0;
            const completed = metrics?.completedAppointments || 0;
            const cancellationRate = total > 0 ? ((metrics?.cancelledAppointments || 0) / total) * 100 : 0;
            const noShowRate = total > 0 ? ((metrics?.noShowAppointments || 0) / total) * 100 : 0;
            const completionRate = total > 0 ? (completed / total) * 100 : 0;

            return (
              <Card key={doctor._id} size="1">
                <Flex justify="between" align="start" mb="2">
                  <Box>
                    <Heading size="3">
                      {doctor.title || 'Dr.'} {doctor.firstName} {doctor.lastName}
                    </Heading>
                    <Text size="2" color="gray">{doctor.specialization}</Text>
                  </Box>
                  <Button asChild variant="soft" color="blue" size="1">
                    <Link href={`/doctors/${doctor._id}`}>View →</Link>
                  </Button>
                </Flex>
                <Flex gap="2" wrap="wrap">
                  <Box>
                    <Text size="3" weight="bold">{total}</Text>
                    <Text size="1" color="gray">Total</Text>
                  </Box>
                  <Box>
                    <Text size="3" weight="bold">{completed}</Text>
                    <Text size="1" color="gray">Completed</Text>
                  </Box>
                  <Box>
                    <Text size="3" weight="bold">{completionRate.toFixed(1)}%</Text>
                    <Text size="1" color="gray">Completion Rate</Text>
                  </Box>
                  <Box>
                    <Text size="3" weight="bold">{cancellationRate.toFixed(1)}%</Text>
                    <Text size="1" color="gray">Cancellation Rate</Text>
                  </Box>
                  <Box>
                    <Text size="3" weight="bold">{noShowRate.toFixed(1)}%</Text>
                    <Text size="1" color="gray">No-Show Rate</Text>
                  </Box>
                </Flex>
              </Card>
            );
          })}
        </Flex>
      )}
        </Flex>
      </Container>
    </Section>
  );
}
