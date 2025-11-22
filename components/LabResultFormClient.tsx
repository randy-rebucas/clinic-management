'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LabResultForm from './LabResultForm';
import { Button, Flex, Box, Text } from '@radix-ui/themes';

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
      <Box p="4" style={{ width: '100%' }}>
        <Flex align="center" justify="center" style={{ height: '256px' }}>
          <Flex direction="column" align="center" gap="3">
            <Box
              style={{
                width: '32px',
                height: '32px',
                border: '4px solid var(--gray-6)',
                borderTop: '4px solid var(--blue-9)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <Text size="2" color="gray">Loading...</Text>
          </Flex>
        </Flex>
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: '100vh', backgroundColor: 'var(--gray-2)' }}>
      <Box p="4" style={{ width: '100%' }}>
        <Box mb="4">
          <Flex align="center" gap="3" mb="1">
            <Button
              variant="ghost"
              size="1"
              onClick={handleCancel}
              style={{ color: 'var(--gray-11)' }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Text size="6" weight="bold">New Lab Order</Text>
          </Flex>
          <Text size="2" color="gray" ml="8">Create a new laboratory test order</Text>
        </Box>

        <Box
          style={{
            backgroundColor: 'white',
            borderRadius: 'var(--radius-2)',
            border: '1px solid var(--gray-6)',
            padding: '16px',
          }}
        >
          {submitting ? (
            <Flex align="center" justify="center" py="8">
              <Flex direction="column" align="center" gap="3">
                <Box
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '4px solid var(--gray-6)',
                    borderTop: '4px solid var(--blue-9)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <Text size="2" color="gray">Creating lab order...</Text>
              </Flex>
            </Flex>
          ) : (
            <LabResultForm
              initialData={patientId ? { patient: patientId } : undefined}
              patients={patients}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

