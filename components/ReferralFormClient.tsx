'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Section, Box, Flex, Heading, Text, Button, Card, Spinner } from '@radix-ui/themes';
import ReferralForm from './ReferralForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
}

interface Doctor {
  _id: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export default function ReferralFormClient({ patientId }: { patientId?: string } = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

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

      const patientsData = await patientsRes.json();
      const doctorsData = await doctorsRes.json();

      if (patientsData.success) {
        setPatients(patientsData.data);
      }
      if (doctorsData.success) {
        setDoctors(doctorsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/referrals', {
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
        router.push('/referrals');
      } else {
        alert(data.error || 'Failed to create referral');
      }
    } catch (error) {
      console.error('Failed to create referral:', error);
      alert('Failed to create referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/referrals');
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
              <Heading size="8" mb="1">New Referral</Heading>
              <Text size="2" color="gray">Create a new patient referral</Text>
            </Box>
          </Flex>

          {/* Form Card */}
          <Card size="2" variant="surface">
            {submitting ? (
              <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '200px' }}>
                <Spinner size="3" />
                <Text size="2" color="gray">Creating referral...</Text>
              </Flex>
            ) : (
              <ReferralForm
                initialData={patientId ? { patient: patientId } : undefined}
                patients={patients}
                doctors={doctors}
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

