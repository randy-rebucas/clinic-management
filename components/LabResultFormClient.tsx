'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LabResultForm from './LabResultForm';
import { Button, Flex, Box, Text, Container, Section, Card, Spinner, Heading } from '@radix-ui/themes';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

export default function LabResultFormClient({ patientId }: { patientId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPatients = async () => {
    try {
      const res = await fetch('/api/patients');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPatients(data.data);
        if (patientId) {
          // Pre-select patient if patientId is provided
          const patient = data.data.find((p: Patient) => p._id === patientId);
          if (patient) {
            // This will be handled by the form component
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch patients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: {
    patient: string;
    testType: string;
    notes?: string;
    priority?: string;
    requestedBy?: string;
    [key: string]: unknown;
  }) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/lab-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push('/lab-results');
      } else {
        alert(data.error || 'Failed to create lab order');
      }
    } catch (error) {
      console.error('Failed to create lab order:', error);
      alert('Failed to create lab order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/lab-results');
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading...</Text>
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
          <Flex align="center" gap="2">
            <Button variant="ghost" size="2" onClick={handleCancel}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Box>
              <Heading size="8" mb="1">New Lab Order</Heading>
              <Text size="2" color="gray">Create a new laboratory test order</Text>
            </Box>
          </Flex>

          {/* Form Card */}
          <Card size="2" variant="surface">
            {submitting ? (
              <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '200px' }}>
                <Spinner size="3" />
                <Text size="2" color="gray">Creating lab order...</Text>
              </Flex>
            ) : (
              <LabResultForm
                initialData={patientId ? { patient: patientId } : undefined}
                patients={patients}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
              />
            )}
          </Card>
        </Flex>
      </Container>
    </Section>
  );
}

