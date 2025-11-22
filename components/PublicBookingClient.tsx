'use client';

import { useState, useEffect, FormEvent } from 'react';
import { Button, TextField, Select, Card, Flex, Box, Text, Spinner, Callout, TextArea, Heading, Separator } from '@radix-ui/themes';

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization: string;
}

interface BookingFormData {
  patientFirstName: string;
  patientLastName: string;
  patientEmail: string;
  patientPhone: string;
  doctorId: string;
  appointmentDate: string;
  appointmentTime: string;
  reason: string;
  room?: string;
}

export default function PublicBookingClient() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [formData, setFormData] = useState<BookingFormData>({
    patientFirstName: '',
    patientLastName: '',
    patientEmail: '',
    patientPhone: '',
    doctorId: '',
    appointmentDate: '',
    appointmentTime: '',
    reason: '',
    room: '',
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
    if (selectedDate && selectedDoctor) {
      fetchAvailableSlots(selectedDate, selectedDoctor);
    } else {
      setAvailableSlots([]);
    }
  }, [selectedDate, selectedDoctor]);

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/appointments/public');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctors(data.data.doctors || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch doctors:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async (date: string, doctorId: string) => {
    try {
      const res = await fetch(`/api/appointments/public?date=${date}&doctorId=${doctorId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAvailableSlots(data.data.availableSlots || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch available slots:', error);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch('/api/appointments/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          doctorId: selectedDoctor,
          appointmentDate: selectedDate,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        // Reset form
        setFormData({
          patientFirstName: '',
          patientLastName: '',
          patientEmail: '',
          patientPhone: '',
          doctorId: '',
          appointmentDate: '',
          appointmentTime: '',
          reason: '',
          room: '',
        });
        setSelectedDate('');
        setSelectedDoctor('');
        setAvailableSlots([]);
      } else {
        setError(data.error || 'Failed to book appointment');
      }
    } catch (error) {
      console.error('Failed to book appointment:', error);
      setError('Failed to submit appointment request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const hour = hours % 12 || 12;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    return `${hour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <Box className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <Flex direction="column" align="center" gap="4">
          <Spinner size="3" />
          <Text size="3" color="gray">Loading...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <Box className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card size="3">
          <Flex direction="column" gap="4" mb="4">
            <Box style={{ textAlign: 'center' }}>
              <Heading size="7" mb="2">Book an Appointment</Heading>
              <Text size="2" color="gray">Fill out the form below to request an appointment</Text>
            </Box>

            {success && (
              <Callout.Root color="green" size="2">
                <Callout.Text>
                  Appointment request submitted successfully! You will receive a confirmation shortly.
                </Callout.Text>
              </Callout.Root>
            )}

            {error && (
              <Callout.Root color="red" size="2">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}
          </Flex>

          <form onSubmit={handleSubmit}>
            <Flex direction="column" gap="6">
              {/* Patient Information */}
              <Box pb="6" style={{ borderBottom: '1px solid var(--gray-6)' }}>
                <Heading size="5" mb="4">Patient Information</Heading>
                <Flex direction="column" gap="4" className="md:flex-row md:flex-wrap">
                  <Box className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <Text size="2" weight="medium" mb="2" as="div">First Name <Text color="red">*</Text></Text>
                    <TextField.Root
                      size="2"
                      required
                      value={formData.patientFirstName}
                      onChange={(e) => setFormData({ ...formData, patientFirstName: e.target.value })}
                    />
                  </Box>
                  <Box className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <Text size="2" weight="medium" mb="2" as="div">Last Name <Text color="red">*</Text></Text>
                    <TextField.Root
                      size="2"
                      required
                      value={formData.patientLastName}
                      onChange={(e) => setFormData({ ...formData, patientLastName: e.target.value })}
                    />
                  </Box>
                  <Box className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <Text size="2" weight="medium" mb="2" as="div">Email <Text color="red">*</Text></Text>
                    <TextField.Root
                      type="email"
                      size="2"
                      required
                      value={formData.patientEmail}
                      onChange={(e) => setFormData({ ...formData, patientEmail: e.target.value })}
                    />
                  </Box>
                  <Box className="md:flex-1 md:min-w-[200px]" style={{ flex: '1 1 calc(50% - 8px)', minWidth: '200px' }}>
                    <Text size="2" weight="medium" mb="2" as="div">Phone <Text color="red">*</Text></Text>
                    <TextField.Root
                      type="tel"
                      size="2"
                      required
                      value={formData.patientPhone}
                      onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })}
                      placeholder="+1234567890"
                    />
                  </Box>
                </Flex>
              </Box>

              {/* Appointment Details */}
              <Box pb="6" style={{ borderBottom: '1px solid var(--gray-6)' }}>
                <Heading size="5" mb="4">Appointment Details</Heading>
                <Flex direction="column" gap="4">
                  <Box>
                    <Text size="2" weight="medium" mb="2" as="div">Doctor <Text color="red">*</Text></Text>
                    <Select.Root
                      required
                      value={selectedDoctor}
                      onValueChange={(value) => {
                        setSelectedDoctor(value);
                        setFormData({ ...formData, doctorId: value });
                      }}
                      size="2"
                    >
                      <Select.Trigger placeholder="Select a doctor" />
                      <Select.Content>
                        {doctors.map((doctor) => (
                          <Select.Item key={doctor._id} value={doctor._id}>
                            Dr. {doctor.firstName} {doctor.lastName} - {doctor.specialization}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </Box>
                  <Flex direction="column" gap="4" className="md:flex-row">
                    <Box className="md:flex-1" style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="2" as="div">Preferred Date <Text color="red">*</Text></Text>
                      <TextField.Root
                        type="date"
                        size="2"
                        required
                        min={getMinDate()}
                        value={selectedDate}
                        onChange={(e) => {
                          setSelectedDate(e.target.value);
                          setFormData({ ...formData, appointmentDate: e.target.value });
                        }}
                      />
                    </Box>
                    <Box className="md:flex-1" style={{ flex: 1 }}>
                      <Text size="2" weight="medium" mb="2" as="div">Preferred Time <Text color="red">*</Text></Text>
                      {availableSlots.length > 0 ? (
                        <Select.Root
                          required
                          value={formData.appointmentTime}
                          onValueChange={(value) => setFormData({ ...formData, appointmentTime: value })}
                          size="2"
                        >
                          <Select.Trigger placeholder="Select a time" />
                          <Select.Content>
                            {availableSlots.map((slot) => (
                              <Select.Item key={slot} value={slot}>
                                {formatTime(slot)}
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Root>
                      ) : (
                        <TextField.Root
                          type="time"
                          size="2"
                          required
                          value={formData.appointmentTime}
                          onChange={(e) => setFormData({ ...formData, appointmentTime: e.target.value })}
                          disabled={!selectedDate || !selectedDoctor}
                        />
                      )}
                      {selectedDate && selectedDoctor && availableSlots.length === 0 && (
                        <Text size="1" color="gray" mt="1" as="div">No available slots. Please select a different date or doctor.</Text>
                      )}
                    </Box>
                  </Flex>
                  <Box>
                    <Text size="2" weight="medium" mb="2" as="div">Reason for Visit</Text>
                    <TextArea
                      size="2"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      rows={3}
                      placeholder="Brief description of your reason for the appointment..."
                    />
                  </Box>
                  <Box>
                    <Text size="2" weight="medium" mb="2" as="div">Preferred Room (Optional)</Text>
                    <TextField.Root
                      size="2"
                      value={formData.room}
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                      placeholder="e.g., Room 101"
                    />
                  </Box>
                </Flex>
              </Box>

              <Separator size="4" />
              <Flex direction="column" gap="4" pt="4" className="sm:flex-row sm:items-center sm:justify-between">
                <Text size="2" color="gray" className="sm:mb-0">
                  * Required fields. Your appointment request will be reviewed and confirmed.
                </Text>
                <Button
                  type="submit"
                  disabled={submitting}
                  size="3"
                  className="w-full sm:w-auto"
                >
                  {submitting ? (
                    <Flex align="center" gap="2">
                      <Spinner size="1" />
                      Submitting...
                    </Flex>
                  ) : (
                    'Request Appointment'
                  )}
                </Button>
              </Flex>
            </Flex>
          </form>
        </Card>
      </Box>
    </Box>
  );
}

