'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Section, Box, Flex, Heading, Text, Button, Card, Spinner } from '@radix-ui/themes';
import InvoiceForm from './InvoiceForm';

interface Patient {
  _id: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  patientCode?: string;
  discountEligibility?: {
    pwd?: { eligible: boolean; idNumber?: string };
    senior?: { eligible: boolean; idNumber?: string };
    membership?: { eligible: boolean; membershipType?: string; discountPercentage?: number };
  };
}

interface Visit {
  _id: string;
  visitCode: string;
  date: string;
  visitType?: string;
}

interface Service {
  _id: string;
  name: string;
  code?: string;
  category?: string;
  unitPrice: number;
  unit?: string;
}

export default function InvoiceFormClient({ 
  patientId, 
  visitId 
}: { 
  patientId?: string; 
  visitId?: string;
} = {}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, [patientId, visitId]);

  const fetchData = async () => {
    try {
      const [patientsRes, servicesRes, visitsRes] = await Promise.all([
        fetch('/api/patients'),
        fetch('/api/services?active=true'),
        patientId ? fetch(`/api/visits?patientId=${patientId}`) : Promise.resolve(null),
      ]);

      if (patientsRes.status === 401 || servicesRes.status === 401) {
        router.push('/login');
        return;
      }

      const [patientsData, servicesData, visitsData] = await Promise.all([
        patientsRes.json(),
        servicesRes.json(),
        visitsRes ? visitsRes.json() : Promise.resolve({ success: true, data: [] }),
      ]);

      if (patientsData.success) {
        setPatients(patientsData.data);
      }
      if (servicesData.success) {
        setServices(servicesData.data);
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

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/invoices', {
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
        router.push('/invoices');
      } else {
        alert(data.error || 'Failed to create invoice');
      }
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/invoices');
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
              <Heading size="8" mb="1">New Invoice</Heading>
              <Text size="2" color="gray">Create a new invoice for billing</Text>
            </Box>
          </Flex>

          {/* Form Card */}
          <Card size="2" variant="surface">
            {submitting ? (
              <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '200px' }}>
                <Spinner size="3" />
                <Text size="2" color="gray">Creating invoice...</Text>
              </Flex>
            ) : (
              <InvoiceForm
                initialData={patientId ? { patient: patientId, visit: visitId } : undefined}
                patients={patients}
                visits={visits}
                services={services}
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

