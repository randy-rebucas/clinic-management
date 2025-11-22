'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppointmentCalendar from './AppointmentCalendar';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Tabs, Heading, Callout, TextArea } from '@radix-ui/themes';
import { useSetting } from './SettingsContext';

interface Appointment {
  _id: string;
  appointmentCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  doctor?: {
    _id: string;
    firstName: string;
    lastName: string;
    specialization: string;
  };
  provider?: {
    _id: string;
    name: string;
  };
  appointmentDate: string;
  appointmentTime: string;
  scheduledAt?: string;
  duration: number;
  status: 'pending' | 'scheduled' | 'confirmed' | 'rescheduled' | 'no-show' | 'completed' | 'cancelled';
  reason?: string;
  notes?: string;
  isWalkIn?: boolean;
  queueNumber?: number;
  estimatedWaitTime?: number;
  room?: string;
}

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
}

export default function AppointmentsPageClient({ patientId }: { patientId?: string } = {}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showWalkInForm, setShowWalkInForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list' | 'queue'>('calendar');
  const defaultDuration = useSetting('appointmentSettings.defaultDuration', 30);
  
  const [formData, setFormData] = useState({
    patient: '',
    doctor: '',
    room: '',
    appointmentDate: '',
    appointmentTime: '',
    duration: defaultDuration,
    reason: '',
    notes: '',
    status: 'scheduled' as const,
    isWalkIn: false,
  });
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [filterDoctor, setFilterDoctor] = useState<string>('');
  const [filterRoom, setFilterRoom] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  // Handle patientId prop - open form and pre-select patient
  useEffect(() => {
    if (patientId && patients.length > 0 && !showForm && !showWalkInForm) {
      // Check if patient exists in the list
      const patientExists = patients.some(p => p._id === patientId);
      if (patientExists) {
        const patient = patients.find(p => p._id === patientId);
        setFormData(prev => ({
          ...prev,
          patient: patientId,
          appointmentDate: selectedDate.toISOString().split('T')[0],
        }));
        if (patient) {
          setSelectedPatient(patient);
          setPatientSearch(`${patient.firstName} ${patient.lastName}`);
        }
        setShowForm(true);
        setShowWalkInForm(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, patients.length]);

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

  useEffect(() => {
    if (selectedDate) {
      fetchAppointmentsForDate(selectedDate);
    }
  }, [selectedDate]);

  const fetchData = async () => {
    try {
      const [patientsRes, doctorsRes] = await Promise.all([
        fetch('/api/patients'),
        fetch('/api/doctors'),
      ]);

      if (patientsRes.status === 401 || doctorsRes.status === 401) {
        router.push('/login');
        return;
      }

      const parseResponse = async (res: Response) => {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await res.json();
        }
        return { success: false, error: `API error: ${res.status}` };
      };

      const patientsData = await parseResponse(patientsRes);
      const doctorsData = await parseResponse(doctorsRes);

      if (patientsData.success) setPatients(patientsData.data);
      if (doctorsData.success) setDoctors(doctorsData.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointmentsForDate = async (date: Date) => {
    try {
      const dateStr = date.toISOString().split('T')[0];
      let url = `/api/appointments?date=${dateStr}`;
      if (filterDoctor) {
        url += `&doctorId=${filterDoctor}`;
      }
      if (filterRoom) {
        url += `&room=${encodeURIComponent(filterRoom)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAppointments(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    }
  };

  useEffect(() => {
    if (selectedDate) {
      fetchAppointmentsForDate(selectedDate);
    }
  }, [selectedDate, filterDoctor, filterRoom]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.patient || !selectedPatient) {
      setError('Please select a valid patient');
      setTimeout(() => setError(null), 3000);
      setShowPatientSearch(true);
      return;
    }
    try {
      const isWalkIn = formData.isWalkIn;
      
      // For walk-ins, get next queue number
      let queueNumber;
      if (isWalkIn) {
        const today = new Date().toISOString().split('T')[0];
        const todayRes = await fetch(`/api/appointments?date=${today}&status=scheduled,confirmed`);
        if (todayRes.ok) {
          const todayData = await todayRes.json();
          if (todayData.success) {
            const todayWalkIns = todayData.data.filter((apt: Appointment) => apt.isWalkIn);
            queueNumber = todayWalkIns.length > 0 
              ? Math.max(...todayWalkIns.map((apt: Appointment) => apt.queueNumber || 0)) + 1
              : 1;
          }
        }
      }

      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          appointmentDate: new Date(formData.appointmentDate),
          queueNumber: isWalkIn ? queueNumber : undefined,
          estimatedWaitTime: isWalkIn ? 30 : undefined, // Default 30 min wait for walk-ins
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
        const text = await res.text();
        console.error('API returned non-JSON response:', text.substring(0, 500));
        setError('Failed to create appointment: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (data.success) {
        setShowForm(false);
        setShowWalkInForm(false);
        setFormData({
          patient: '',
          doctor: '',
          room: '',
          appointmentDate: '',
          appointmentTime: '',
          duration: 30,
          reason: '',
          notes: '',
          status: 'scheduled',
          isWalkIn: false,
        });
        setPatientSearch('');
        setSelectedPatient(null);
        fetchAppointmentsForDate(selectedDate);
        setSuccess(isWalkIn ? `Walk-in appointment created! Queue number: ${queueNumber}` : 'Appointment scheduled successfully!');
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to create appointment:', error);
      setError('Failed to create appointment');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
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
        setError('Failed to update appointment: API error');
        setTimeout(() => setError(null), 5000);
        return;
      }

      if (data.success) {
        fetchAppointmentsForDate(selectedDate);
        setSuccess('Appointment updated successfully!');
        setTimeout(() => setSuccess(null), 3000);
        // Send reminder if status is confirmed
        if (status === 'confirmed') {
          // Trigger reminder (will be implemented)
          console.log('Sending confirmation reminder...');
        }
      } else {
        setError('Error: ' + data.error);
        setTimeout(() => setError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to update appointment:', error);
      setError('Failed to update appointment');
      setTimeout(() => setError(null), 5000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'gray' | 'red' | 'yellow' | 'purple' | 'orange' => {
    switch (status) {
      case 'confirmed':
        return 'green';
      case 'scheduled':
        return 'blue';
      case 'completed':
        return 'gray';
      case 'cancelled':
        return 'red';
      case 'no-show':
        return 'yellow';
      case 'pending':
        return 'purple';
      case 'rescheduled':
        return 'orange';
      default:
        return 'gray';
    }
  };

  const getSelectedDateAppointments = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    return appointments.filter((apt) => {
      const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
      return aptDate === dateStr;
    }).sort((a, b) => {
      const timeA = a.appointmentTime || '00:00';
      const timeB = b.appointmentTime || '00:00';
      return timeA.localeCompare(timeB);
    });
  };

  const getWalkInQueue = () => {
    const today = new Date().toISOString().split('T')[0];
    return appointments
      .filter((apt) => {
        const aptDate = new Date(apt.appointmentDate).toISOString().split('T')[0];
        return apt.isWalkIn && aptDate === today && ['scheduled', 'confirmed'].includes(apt.status);
      })
      .sort((a, b) => (a.queueNumber || 0) - (b.queueNumber || 0));
  };

  if (loading) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading appointments...</Text>
        </Flex>
      </Box>
    );
  }

  const selectedDateAppointments = getSelectedDateAppointments();
  const walkInQueue = getWalkInQueue();

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
          <Heading size="7" mb="1">Appointments</Heading>
          <Text size="2" color="gray">Manage appointments and walk-in queue</Text>
        </Box>
        <Flex gap="2" wrap="wrap">
          <Button
            onClick={() => {
              setFormData({ ...formData, isWalkIn: false, appointmentDate: selectedDate.toISOString().split('T')[0] });
              setShowWalkInForm(false);
              setShowForm(true);
            }}
            size="3"
            color="blue"
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule Appointment
          </Button>
          <Button
            onClick={() => {
              setFormData({ ...formData, isWalkIn: true, appointmentDate: new Date().toISOString().split('T')[0] });
              setShowForm(false);
              setShowWalkInForm(true);
            }}
            size="3"
            color="orange"
          >
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Add Walk-In
          </Button>
        </Flex>
      </Flex>

      {/* View Mode Tabs */}
      <Card mb="3">
        <Tabs.Root value={viewMode} onValueChange={(value) => setViewMode(value as typeof viewMode)}>
          <Tabs.List>
            <Tabs.Trigger value="calendar">Calendar View</Tabs.Trigger>
            <Tabs.Trigger value="list">List View</Tabs.Trigger>
            <Tabs.Trigger value="queue">
              Walk-In Queue
              {walkInQueue.length > 0 && (
                <Badge size="1" variant="solid" color="orange" style={{ marginLeft: '6px' }}>
                  {walkInQueue.length}
                </Badge>
              )}
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </Card>

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <Flex direction={{ initial: 'column', lg: 'row' }} gap="4">
          <Box style={{ flex: '0 0 350px' }}>
            <AppointmentCalendar
              appointments={appointments}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />
            {/* Filters */}
            <Card mt="4">
              <Box p="3">
                <Heading size="3" mb="3">Filters</Heading>
                <Flex direction="column" gap="3">
                  <Box>
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
                            {doctor.firstName} {doctor.lastName}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </Box>
                  <Box>
                    <Text size="1" weight="medium" mb="1" as="div">Room</Text>
                    <TextField.Root size="2" style={{ width: '100%' }}>
                      <input
                        type="text"
                        placeholder="Filter by room..."
                        value={filterRoom}
                        onChange={(e) => setFilterRoom(e.target.value)}
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
                  {(filterDoctor || filterRoom) && (
                    <Button
                      onClick={() => {
                        setFilterDoctor('');
                        setFilterRoom('');
                      }}
                      variant="soft"
                      size="2"
                      style={{ width: '100%' }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </Flex>
              </Box>
            </Card>
          </Box>
          <Box style={{ flex: 1 }}>
            <Card>
              <Box p="3">
                <Heading size="3" mb="3">
                  Appointments for {formatDate(selectedDate.toISOString())}
                  {(filterDoctor || filterRoom) && (
                    <Text size="2" color="gray" as="span" style={{ marginLeft: '8px' }}>
                      (Filtered{filterDoctor ? ' by doctor' : ''}{filterRoom ? ' by room' : ''})
                    </Text>
                  )}
                </Heading>
                {selectedDateAppointments.length === 0 ? (
                  <Box style={{ textAlign: 'center', padding: '48px 0' }}>
                    <Box mb="3">
                      <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </Box>
                    <Text color="gray">No appointments scheduled for this date</Text>
                  </Box>
                ) : (
                  <Flex direction="column" gap="3">
                    {selectedDateAppointments.map((appointment) => (
                      <Card key={appointment._id} size="2">
                        <Flex justify="between" align="start" gap="3">
                          <Box style={{ flex: 1 }}>
                            <Flex align="center" gap="2" mb="2" wrap="wrap">
                              <Badge color={getStatusColor(appointment.status)} size="1">
                                {appointment.status}
                              </Badge>
                              {appointment.isWalkIn && (
                                <Badge color="orange" size="1">
                                  Walk-In #{appointment.queueNumber}
                                </Badge>
                              )}
                              {appointment.appointmentCode && (
                                <Text size="1" color="gray">#{appointment.appointmentCode}</Text>
                              )}
                            </Flex>
                            <Text size="2" weight="bold" mb="1" as="div">
                              {appointment.patient.firstName} {appointment.patient.lastName}
                            </Text>
                            <Text size="2" color="gray" mb="1" as="div">
                              {appointment.doctor
                                ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName} - ${appointment.doctor.specialization}`
                                : appointment.provider
                                ? appointment.provider.name
                                : 'No provider assigned'}
                            </Text>
                            <Text size="2" color="gray" mb="1" as="div">
                              {formatTime(appointment.appointmentTime)} ({appointment.duration} min)
                              {appointment.room && (
                                <Text as="span" color="blue" style={{ marginLeft: '8px' }}>
                                  • Room: {appointment.room}
                                </Text>
                              )}
                            </Text>
                            {appointment.reason && (
                              <Text size="2" color="gray" mt="1" as="div">Reason: {appointment.reason}</Text>
                            )}
                            {appointment.estimatedWaitTime && (
                              <Text size="1" color="orange" mt="1" as="div">
                                Estimated wait: {appointment.estimatedWaitTime} minutes
                              </Text>
                            )}
                          </Box>
                          <Flex direction="column" gap="2">
                            {appointment.status === 'scheduled' && (
                              <>
                                <Button
                                  onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                                  size="1"
                                  variant="soft"
                                  color="green"
                                >
                                  Confirm
                                </Button>
                                <Button
                                  onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                                  size="1"
                                  variant="soft"
                                  color="red"
                                >
                                  Cancel
                                </Button>
                              </>
                            )}
                            {appointment.status === 'confirmed' && (
                              <>
                                <Button
                                  onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                                  size="1"
                                  variant="soft"
                                  color="gray"
                                >
                                  Complete
                                </Button>
                                <Button
                                  onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                                  size="1"
                                  variant="soft"
                                  color="yellow"
                                >
                                  No-Show
                                </Button>
                              </>
                            )}
                          </Flex>
                        </Flex>
                      </Card>
                    ))}
                  </Flex>
                )}
              </Box>
            </Card>
          </Box>
        </Flex>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Provider</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Date & Time</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {appointments.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={5} style={{ textAlign: 'center', padding: '48px' }}>
                    <Text color="gray">No appointments found</Text>
                  </Table.Cell>
                </Table.Row>
              ) : (
                appointments.map((appointment) => (
                  <Table.Row key={appointment._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium" as="div">
                        {appointment.patient.firstName} {appointment.patient.lastName}
                      </Text>
                      {appointment.isWalkIn && (
                        <Badge size="1" color="orange" variant="soft">
                          Walk-In #{appointment.queueNumber}
                        </Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {appointment.doctor
                          ? `Dr. ${appointment.doctor.firstName} ${appointment.doctor.lastName}`
                          : appointment.provider
                          ? appointment.provider.name
                          : 'N/A'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray" as="div">
                        {formatDate(appointment.appointmentDate)} at {formatTime(appointment.appointmentTime)}
                      </Text>
                      {appointment.room && (
                        <Text size="1" color="blue" mt="1" as="div">Room: {appointment.room}</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(appointment.status)} size="1">
                        {appointment.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Flex gap="2" justify="end">
                        {appointment.status === 'scheduled' && (
                          <>
                            <Button
                              onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                              size="1"
                              variant="ghost"
                              color="green"
                            >
                              Confirm
                            </Button>
                            <Button
                              onClick={() => handleStatusUpdate(appointment._id, 'cancelled')}
                              size="1"
                              variant="ghost"
                              color="red"
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {appointment.status === 'confirmed' && (
                          <>
                            <Button
                              onClick={() => handleStatusUpdate(appointment._id, 'completed')}
                              size="1"
                              variant="ghost"
                              color="gray"
                            >
                              Complete
                            </Button>
                            <Button
                              onClick={() => handleStatusUpdate(appointment._id, 'no-show')}
                              size="1"
                              variant="ghost"
                              color="yellow"
                            >
                              No-Show
                            </Button>
                          </>
                        )}
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table.Root>
        </Card>
      )}

      {/* Walk-In Queue View */}
      {viewMode === 'queue' && (
        <Card>
          <Box p="3">
            <Heading size="3" mb="3">Today&apos;s Walk-In Queue</Heading>
            {walkInQueue.length === 0 ? (
              <Box style={{ textAlign: 'center', padding: '48px 0' }}>
                <Box mb="3">
                  <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </Box>
                <Text color="gray">No walk-in patients in queue</Text>
              </Box>
            ) : (
              <Flex direction="column" gap="3">
                {walkInQueue.map((appointment) => (
                  <Card key={appointment._id} style={{ background: 'var(--orange-2)', borderColor: 'var(--orange-6)' }}>
                    <Flex justify="between" align="center" gap="3">
                      <Flex align="center" gap="3">
                        <Box
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'var(--orange-9)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 'bold',
                          }}
                        >
                          {appointment.queueNumber}
                        </Box>
                        <Box>
                          <Text size="2" weight="bold" as="div">
                            {appointment.patient.firstName} {appointment.patient.lastName}
                          </Text>
                          <Text size="1" color="gray">{appointment.patient.phone}</Text>
                          {appointment.estimatedWaitTime && (
                            <Text size="1" color="orange" mt="1" as="div">
                              Est. wait: {appointment.estimatedWaitTime} minutes
                            </Text>
                          )}
                        </Box>
                      </Flex>
                      <Flex align="center" gap="2">
                        <Badge color={getStatusColor(appointment.status)} size="1">
                          {appointment.status}
                        </Badge>
                        <Button
                          onClick={() => handleStatusUpdate(appointment._id, 'confirmed')}
                          size="1"
                          variant="soft"
                          color="green"
                        >
                          Confirm
                        </Button>
                      </Flex>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            )}
          </Box>
        </Card>
      )}

      {/* Appointment Form Modal */}
      <Dialog.Root open={showForm || showWalkInForm} onOpenChange={(open) => {
        if (!open) {
          setShowForm(false);
          setShowWalkInForm(false);
          setPatientSearch('');
          setSelectedPatient(null);
          setFormData({ ...formData, patient: '' });
        }
      }}>
        <Dialog.Content style={{ maxWidth: '800px' }}>
          <Dialog.Title>
            {showWalkInForm ? 'Add Walk-In Patient' : 'Schedule Appointment'}
          </Dialog.Title>
          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="3" mt="4">
              <Flex direction={{ initial: 'column', md: 'row' }} gap="3">
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Patient <Text color="red">*</Text></Text>
                  <Box style={{ position: 'relative' }}>
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
                    {showPatientSearch && (
                      <Box
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          marginTop: '4px',
                          background: 'var(--color-panel)',
                          border: '1px solid var(--gray-6)',
                          borderRadius: 'var(--radius-2)',
                          boxShadow: 'var(--shadow-4)',
                          maxHeight: '200px',
                          overflowY: 'auto',
                        }}
                      >
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
                              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                            >
                              <Text weight="medium" size="2">{patient.firstName} {patient.lastName}</Text>
                            </Button>
                          ))}
                        </Flex>
                      ) : patientSearch ? (
                        <Box p="2">
                          <Text size="2" color="gray">No patients found</Text>
                        </Box>
                      ) : (
                        <Box p="2">
                          <Text size="2" color="gray">Start typing to search...</Text>
                        </Box>
                      )}
                      </Box>
                    )}
                  </Box>
                  {formData.patient && !selectedPatient && (
                    <Text size="1" color="red" mt="1" as="div">Please select a valid patient from the list</Text>
                  )}
                </Box>
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Doctor/Provider <Text color="red">*</Text></Text>
                  <Select.Root
                    required
                    value={formData.doctor || undefined}
                    onValueChange={(value) => setFormData({ ...formData, doctor: value })}
                  >
                    <Select.Trigger placeholder="Select a doctor" />
                    <Select.Content>
                      {doctors.map((doctor) => (
                        <Select.Item key={doctor._id} value={doctor._id}>
                          {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Box>
              </Flex>
              <Flex direction={{ initial: 'column', md: 'row' }} gap="3">
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Date <Text color="red">*</Text></Text>
                  <TextField.Root size="2" style={{ width: '100%' }}>
                    <input
                      type="date"
                      required
                      value={formData.appointmentDate}
                      onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
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
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Time <Text color="red">*</Text></Text>
                  <TextField.Root size="2" style={{ width: '100%' }}>
                    <input
                      type="time"
                      required
                      value={formData.appointmentTime}
                      onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
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
              </Flex>
              <Flex direction={{ initial: 'column', md: 'row' }} gap="3">
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Duration (minutes)</Text>
                  <TextField.Root size="2" style={{ width: '100%' }}>
                    <input
                      type="number"
                      min="15"
                      max="240"
                      step="15"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 30 })}
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
                <Box style={{ flex: 1 }}>
                  <Text size="2" weight="medium" mb="1" as="div">Room (Optional)</Text>
                  <TextField.Root size="2" style={{ width: '100%' }}>
                    <input
                      type="text"
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="e.g., Room 101, Consultation Room A"
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
              </Flex>
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Status</Text>
                <Select.Root
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="scheduled">Scheduled</Select.Item>
                    <Select.Item value="confirmed">Confirmed</Select.Item>
                    <Select.Item value="pending">Pending</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>
              <Box>
                <Text size="2" weight="medium" mb="1" as="div">Reason</Text>
                <TextField.Root size="2" style={{ width: '100%' }}>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="Appointment reason"
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
                <Text size="2" weight="medium" mb="1" as="div">Notes</Text>
                <TextArea
                  size="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  style={{ width: '100%' }}
                />
              </Box>
              <Flex justify="end" gap="3" pt="4">
                <Dialog.Close>
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    onClick={() => {
                      setShowForm(false);
                      setShowWalkInForm(false);
                      setPatientSearch('');
                      setSelectedPatient(null);
                      setFormData({ ...formData, patient: '' });
                    }}
                  >
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" color="blue">
                  {showWalkInForm ? 'Add Walk-In' : 'Schedule Appointment'}
                </Button>
              </Flex>
            </Flex>
          </form>
        </Dialog.Content>
      </Dialog.Root>
    </Box>
  );
}
