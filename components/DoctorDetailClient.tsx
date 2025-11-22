'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, AlertDialog, Flex, Container, Section, Box, Text, Heading, Card, Tabs, Callout, Dialog, TextField, Select, Switch, Spinner, Badge, Separator } from '@radix-ui/themes';
import { Cross2Icon } from '@radix-ui/react-icons';

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
  bio?: string;
  qualifications?: string[];
  schedule?: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isAvailable: boolean;
  }>;
  availabilityOverrides?: Array<{
    date: string;
    isAvailable: boolean;
    startTime?: string;
    endTime?: string;
    reason?: string;
  }>;
  internalNotes?: Array<{
    note: string;
    createdBy: {
      _id: string;
      name: string;
    };
    createdAt: string;
    isImportant: boolean;
  }>;
  performanceMetrics?: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    noShowAppointments: number;
    averageRating?: number;
    lastUpdated: string;
  };
}

export default function DoctorDetailClient({ doctorId }: { doctorId: string }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteNoteDialogOpen, setDeleteNoteDialogOpen] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'schedule' | 'notes' | 'performance'>('profile');
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [newNote, setNewNote] = useState({ note: '', isImportant: false });
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: 0,
    startTime: '09:00',
    endTime: '17:00',
    isAvailable: true,
  });
  const router = useRouter();

  useEffect(() => {
    fetchDoctor();
  }, [doctorId]);

  const fetchDoctor = async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}`);
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setDoctor(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch doctor:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/doctors/${doctorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNote),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setNewNote({ note: '', isImportant: false });
          setShowNoteForm(false);
          setSuccess('Note added successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to add note:', error);
      setError('Failed to add note');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteNoteClick = (index: number) => {
    setNoteToDelete(index);
    setDeleteNoteDialogOpen(true);
  };

  const handleDeleteNote = async () => {
    if (noteToDelete === null) return;

    try {
      const res = await fetch(`/api/doctors/${doctorId}/notes?index=${noteToDelete}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setSuccess('Note deleted successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
      setError('Failed to delete note');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleUpdateSchedule = async () => {
    if (!doctor) return;

    try {
      const updatedSchedule = [...(doctor.schedule || [])];
      const existingIndex = updatedSchedule.findIndex((s) => s.dayOfWeek === scheduleForm.dayOfWeek);
      
      if (existingIndex >= 0) {
        updatedSchedule[existingIndex] = scheduleForm;
      } else {
        updatedSchedule.push(scheduleForm);
      }

      const res = await fetch(`/api/doctors/${doctorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: updatedSchedule }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setDoctor(data.data);
          setShowScheduleForm(false);
          setSuccess('Schedule updated successfully!');
          setTimeout(() => setSuccess(null), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to update schedule:', error);
      setError('Failed to update schedule');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleRefreshPerformance = async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}/performance`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Update doctor's performance metrics
          fetchDoctor();
        }
      }
    } catch (error) {
      console.error('Failed to refresh performance:', error);
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
            <Text>Loading doctor...</Text>
          </Flex>
        </Container>
      </Section>
    );
  }

  if (!doctor) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Heading size="5" mb="2">Doctor not found</Heading>
            <Button asChild variant="soft" color="blue">
              <Link href="/doctors">Back to Doctors</Link>
            </Button>
          </Flex>
        </Container>
      </Section>
    );
  }

  const fullName = `${doctor.title || 'Dr.'} ${doctor.firstName} ${doctor.lastName}`;
  const metrics = doctor.performanceMetrics;
  const total = metrics?.totalAppointments || 0;
  const completed = metrics?.completedAppointments || 0;
  const cancelled = metrics?.cancelledAppointments || 0;
  const noShow = metrics?.noShowAppointments || 0;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Notifications */}
          {error && (
            <Callout.Root color="red" size="2">
              <Callout.Icon>
                <Cross2Icon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}
          {success && (
            <Callout.Root color="green" size="2">
              <Callout.Text>{success}</Callout.Text>
            </Callout.Root>
          )}

          {/* Header */}
          <Flex direction="column" gap="1">
            <Flex align="center" gap="2">
              <Button asChild variant="ghost" size="2">
                <Link href="/doctors">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
              </Button>
              <Heading size="8">{fullName}</Heading>
            </Flex>
            <Text size="2" color="gray" ml="7">{doctor.specialization}</Text>
          </Flex>

          {/* Tabs */}
          <Card size="2" variant="surface">
            <Tabs.Root value={activeTab} onValueChange={(value) => {
              if (value === 'performance') {
                handleRefreshPerformance();
              }
              setActiveTab(value as any);
            }}>
              <Tabs.List>
                <Tabs.Trigger value="profile">Profile</Tabs.Trigger>
                <Tabs.Trigger value="schedule">Schedule & Availability</Tabs.Trigger>
                <Tabs.Trigger value="notes">Internal Notes ({doctor.internalNotes?.length || 0})</Tabs.Trigger>
                <Tabs.Trigger value="performance">Performance</Tabs.Trigger>
              </Tabs.List>

              <Box pt="3">
                <Tabs.Content value="profile">
                  <Flex direction="column" gap="3">
                    <Flex gap="3" wrap="wrap">
                      <Card size="2" variant="surface" style={{ flex: '1 1 300px' }}>
                        <Flex direction="column" gap="3" p="3">
                          <Heading size="4">Basic Information</Heading>
                          <Flex direction="column" gap="2">
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">Full Name</Text>
                              <Text size="2">{fullName}</Text>
                            </Box>
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">Specialization</Text>
                              <Text size="2">{doctor.specialization}</Text>
                            </Box>
                            {doctor.department && (
                              <Box>
                                <Text size="1" weight="medium" color="gray" mb="1" as="div">Department</Text>
                                <Text size="2">{doctor.department}</Text>
                              </Box>
                            )}
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">License Number</Text>
                              <Text size="2">{doctor.licenseNumber}</Text>
                            </Box>
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">Status</Text>
                              <Badge color={doctor.status === 'active' ? 'green' : doctor.status === 'inactive' ? 'gray' : 'yellow'} size="1">
                                {doctor.status || 'active'}
                              </Badge>
                            </Box>
                          </Flex>
                        </Flex>
                      </Card>
                      <Card size="2" variant="surface" style={{ flex: '1 1 300px' }}>
                        <Flex direction="column" gap="3" p="3">
                          <Heading size="4">Contact Information</Heading>
                          <Flex direction="column" gap="2">
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">Email</Text>
                              <Text size="2">{doctor.email}</Text>
                            </Box>
                            <Box>
                              <Text size="1" weight="medium" color="gray" mb="1" as="div">Phone</Text>
                              <Text size="2">{doctor.phone}</Text>
                            </Box>
                          </Flex>
                        </Flex>
                      </Card>
                    </Flex>
                    {doctor.qualifications && doctor.qualifications.length > 0 && (
                      <Card size="2" variant="surface">
                        <Flex direction="column" gap="3" p="3">
                          <Heading size="4">Qualifications</Heading>
                          <Flex direction="column" gap="1" style={{ paddingLeft: '1.5rem' }}>
                            {doctor.qualifications.map((qual, idx) => (
                              <Text key={idx} size="2" style={{ position: 'relative', paddingLeft: '0.5rem' }}>
                                <span style={{ position: 'absolute', left: '-0.75rem' }}>•</span>
                                {qual}
                              </Text>
                            ))}
                          </Flex>
                        </Flex>
                      </Card>
                    )}
                    {doctor.bio && (
                      <Card size="2" variant="surface">
                        <Flex direction="column" gap="3" p="3">
                          <Heading size="4">Bio</Heading>
                          <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{doctor.bio}</Text>
                        </Flex>
                      </Card>
                    )}
                  </Flex>
                </Tabs.Content>

                <Tabs.Content value="schedule">
                  <Flex direction="column" gap="3">
                    <Flex justify="between" align="center">
                      <Heading size="4">Weekly Schedule</Heading>
                      <Button onClick={() => setShowScheduleForm(true)} size="2">
                        + Add/Edit Schedule
                      </Button>
                    </Flex>
                    {doctor.schedule && doctor.schedule.length > 0 ? (
                      <Flex direction="column" gap="2">
                        {[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const schedule = doctor.schedule?.find((s) => s.dayOfWeek === day);
                          return (
                            <Card key={day} size="1" variant="surface">
                              <Flex justify="between" align="center" p="2">
                                <Flex align="center" gap="3">
                                  <Text size="2" weight="medium" style={{ width: '80px' }}>{getDayName(day)}</Text>
                                  {schedule && schedule.isAvailable ? (
                                    <Text size="2" color="gray">
                                      {formatTime(schedule.startTime)} - {formatTime(schedule.endTime)}
                                    </Text>
                                  ) : (
                                    <Text size="2" color="gray">Not available</Text>
                                  )}
                                </Flex>
                                {schedule && schedule.isAvailable && (
                                  <Badge color="green" size="1">Available</Badge>
                                )}
                              </Flex>
                            </Card>
                          );
                        })}
                      </Flex>
                    ) : (
                      <Flex justify="center" align="center" style={{ minHeight: '150px' }}>
                        <Text size="2" color="gray">No schedule set. Click &quot;Add/Edit Schedule&quot; to set availability.</Text>
                      </Flex>
                    )}

                    {/* Schedule Form Modal */}
                    <Dialog.Root open={showScheduleForm} onOpenChange={setShowScheduleForm}>
                      <Dialog.Content style={{ maxWidth: '500px' }}>
                        <Dialog.Title>Edit Schedule</Dialog.Title>
                        <Flex direction="column" gap="3" py="4">
                          <Box>
                            <Text size="2" weight="medium" mb="2" as="div">Day of Week</Text>
                            <Select.Root
                              value={scheduleForm.dayOfWeek.toString()}
                              onValueChange={(value) => setScheduleForm({ ...scheduleForm, dayOfWeek: parseInt(value) })}
                              size="2"
                            >
                              <Select.Trigger />
                              <Select.Content>
                                {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                  <Select.Item key={day} value={day.toString()}>
                                    {getDayName(day)}
                                  </Select.Item>
                                ))}
                              </Select.Content>
                            </Select.Root>
                          </Box>
                          <Flex gap="2">
                            <Box flexGrow="1">
                              <Text size="2" weight="medium" mb="2" as="div">Start Time</Text>
                              <TextField.Root size="2" type="time">
                                <input
                                  type="time"
                                  value={scheduleForm.startTime}
                                  onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                            <Box flexGrow="1">
                              <Text size="2" weight="medium" mb="2" as="div">End Time</Text>
                              <TextField.Root size="2" type="time">
                                <input
                                  type="time"
                                  value={scheduleForm.endTime}
                                  onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                                  style={{ all: 'unset', flex: 1 }}
                                />
                              </TextField.Root>
                            </Box>
                          </Flex>
                          <Flex align="center" gap="2">
                            <Switch
                              size="2"
                              checked={scheduleForm.isAvailable}
                              onCheckedChange={(checked) => setScheduleForm({ ...scheduleForm, isAvailable: checked })}
                            />
                            <Text size="2">Available on this day</Text>
                          </Flex>
                          <Separator />
                          <Flex justify="end" gap="2">
                            <Button variant="soft" onClick={() => setShowScheduleForm(false)} size="2">
                              Cancel
                            </Button>
                            <Button onClick={handleUpdateSchedule} size="2">
                              Save
                            </Button>
                          </Flex>
                        </Flex>
                      </Dialog.Content>
                    </Dialog.Root>
                  </Flex>
                </Tabs.Content>

                <Tabs.Content value="notes">
                  <Flex direction="column" gap="3">
                    <Flex justify="between" align="center">
                      <Heading size="4">Internal Notes</Heading>
                      <Button onClick={() => setShowNoteForm(true)} size="2">
                        + Add Note
                      </Button>
                    </Flex>
                    {doctor.internalNotes && doctor.internalNotes.length > 0 ? (
                      <Flex direction="column" gap="2">
                        {doctor.internalNotes.map((note, index) => (
                          <Card
                            key={index}
                            size="2"
                            variant="surface"
                            style={{
                              borderColor: note.isImportant ? 'var(--red-6)' : undefined,
                              backgroundColor: note.isImportant ? 'var(--red-2)' : undefined,
                            }}
                          >
                            <Flex direction="column" gap="2" p="3">
                              <Flex justify="between" align="start">
                                <Flex align="center" gap="2">
                                  {note.isImportant && (
                                    <Badge color="red" size="1">Important</Badge>
                                  )}
                                  <Text size="1" color="gray">
                                    {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </Text>
                                </Flex>
                                <Button
                                  variant="ghost"
                                  color="red"
                                  size="1"
                                  onClick={() => handleDeleteNoteClick(index)}
                                >
                                  Delete
                                </Button>
                              </Flex>
                              <Text size="2" style={{ whiteSpace: 'pre-wrap' }}>{note.note}</Text>
                            </Flex>
                          </Card>
                        ))}
                      </Flex>
                    ) : (
                      <Flex justify="center" align="center" style={{ minHeight: '150px' }}>
                        <Text size="2" color="gray">No internal notes. Click &quot;Add Note&quot; to add one.</Text>
                      </Flex>
                    )}

                    {/* Note Form Modal */}
                    <Dialog.Root open={showNoteForm} onOpenChange={setShowNoteForm}>
                      <Dialog.Content style={{ maxWidth: '500px' }}>
                        <Dialog.Title>Add Internal Note</Dialog.Title>
                        <form onSubmit={handleAddNote}>
                          <Flex direction="column" gap="3" py="4">
                            <Box>
                              <Text size="2" weight="medium" mb="2" as="div">Note</Text>
                              <TextField.Root size="2">
                                <textarea
                                  required
                                  value={newNote.note}
                                  onChange={(e) => setNewNote({ ...newNote, note: e.target.value })}
                                  rows={4}
                                  style={{
                                    all: 'unset',
                                    flex: 1,
                                    width: '100%',
                                    minHeight: '80px',
                                    resize: 'vertical',
                                  }}
                                />
                              </TextField.Root>
                            </Box>
                            <Flex align="center" gap="2">
                              <Switch
                                size="2"
                                checked={newNote.isImportant}
                                onCheckedChange={(checked) => setNewNote({ ...newNote, isImportant: checked })}
                              />
                              <Text size="2">Mark as important</Text>
                            </Flex>
                            <Separator />
                            <Flex justify="end" gap="2">
                              <Button type="button" variant="soft" onClick={() => setShowNoteForm(false)} size="2">
                                Cancel
                              </Button>
                              <Button type="submit" size="2">
                                Add Note
                              </Button>
                            </Flex>
                          </Flex>
                        </form>
                      </Dialog.Content>
                    </Dialog.Root>
                  </Flex>
                </Tabs.Content>

                <Tabs.Content value="performance">
                  <Flex direction="column" gap="3">
                    <Flex justify="between" align="center">
                      <Heading size="4">Performance Metrics</Heading>
                      <Button onClick={handleRefreshPerformance} size="2">
                        Refresh Data
                      </Button>
                    </Flex>
                    {metrics ? (
                      <Flex direction="column" gap="3">
                        <Flex gap="2" wrap="wrap">
                          <Card size="2" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--blue-3)' }}>
                            <Flex direction="column" gap="1" p="3">
                              <Text size="6" weight="bold" style={{ color: 'var(--blue-9)' }}>{total}</Text>
                              <Text size="1" color="gray">Total Appointments</Text>
                            </Flex>
                          </Card>
                          <Card size="2" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--green-3)' }}>
                            <Flex direction="column" gap="1" p="3">
                              <Text size="6" weight="bold" style={{ color: 'var(--green-9)' }}>{completed}</Text>
                              <Text size="1" color="gray">Completed</Text>
                              <Text size="1" color="gray">{Math.round(completionRate)}% completion rate</Text>
                            </Flex>
                          </Card>
                          <Card size="2" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--red-3)' }}>
                            <Flex direction="column" gap="1" p="3">
                              <Text size="6" weight="bold" style={{ color: 'var(--red-9)' }}>{cancelled}</Text>
                              <Text size="1" color="gray">Cancelled</Text>
                              <Text size="1" color="gray">
                                {total > 0 ? Math.round((cancelled / total) * 100) : 0}% cancellation rate
                              </Text>
                            </Flex>
                          </Card>
                          <Card size="2" variant="surface" style={{ flex: '1 1 200px', backgroundColor: 'var(--yellow-3)' }}>
                            <Flex direction="column" gap="1" p="3">
                              <Text size="6" weight="bold" style={{ color: 'var(--yellow-9)' }}>{noShow}</Text>
                              <Text size="1" color="gray">No-Show</Text>
                              <Text size="1" color="gray">
                                {total > 0 ? Math.round((noShow / total) * 100) : 0}% no-show rate
                              </Text>
                            </Flex>
                          </Card>
                        </Flex>
                        {metrics.lastUpdated && (
                          <Text size="1" color="gray">
                            Last updated: {new Date(metrics.lastUpdated).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </Text>
                        )}
                      </Flex>
                    ) : (
                      <Flex justify="center" align="center" style={{ minHeight: '150px' }}>
                        <Text size="2" color="gray">No performance data available. Click &quot;Refresh Data&quot; to calculate metrics.</Text>
                      </Flex>
                    )}
                  </Flex>
                </Tabs.Content>
              </Box>
            </Tabs.Root>
          </Card>

          {/* Delete Note Alert Dialog */}
          <AlertDialog.Root open={deleteNoteDialogOpen} onOpenChange={setDeleteNoteDialogOpen}>
            <AlertDialog.Content>
              <AlertDialog.Title>Delete Note</AlertDialog.Title>
              <AlertDialog.Description>
                Are you sure you want to delete this note? This action cannot be undone.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray" onClick={() => {
                    setDeleteNoteDialogOpen(false);
                    setNoteToDelete(null);
                  }}>
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Button variant="solid" color="red" onClick={handleDeleteNote}>
                    Delete
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

