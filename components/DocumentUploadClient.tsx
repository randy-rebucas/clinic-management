'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Section, Box, Flex, Heading, Text, Button, Card, Spinner } from '@radix-ui/themes';
import DocumentUploadForm from './DocumentUploadForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  patientCode?: string;
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

export default function DocumentUploadClient({ 
  patientId, 
  visitId 
}: { 
  patientId?: string; 
  visitId?: string;
} = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, [patientId, visitId]);

  const fetchData = async () => {
    try {
      const [patientsRes, visitsRes] = await Promise.all([
        fetch('/api/patients'),
        patientId ? fetch(`/api/visits?patientId=${patientId}`) : Promise.resolve(null),
      ]);

      if (patientsRes.status === 401) {
        router.push('/login');
        return;
      }

      const [patientsData, visitsData] = await Promise.all([
        patientsRes.json(),
        visitsRes ? visitsRes.json() : Promise.resolve({ success: true, data: [] }),
      ]);

      if (patientsData.success) {
        setPatients(patientsData.data);
      }
      if (visitsData.success) {
        setVisits(visitsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (formData: FormData) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      const data = await res.json();
      if (data.success) {
        router.push('/documents');
      } else {
        alert(data.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Failed to upload document:', error);
      alert('Failed to upload document. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/documents');
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
              <Heading size="8" mb="1">Upload Document</Heading>
              <Text size="2" color="gray">Upload and categorize a new document</Text>
            </Box>
          </Flex>

          {/* Form Card */}
          <Card size="2" variant="surface">
            {submitting ? (
              <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '200px' }}>
                <Spinner size="3" />
                <Text size="2" color="gray">Uploading document...</Text>
              </Flex>
            ) : (
              <DocumentUploadForm
                initialData={patientId ? { patient: patientId, visit: visitId } : undefined}
                patients={patients}
                visits={visits}
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

