'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Section, Box, Flex, Heading, Text, Button, Card, Spinner } from '@radix-ui/themes';
import InventoryForm from './InventoryForm';

export default function InventoryFormClient() {
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (formData: any) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/inventory', {
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
        router.push('/inventory');
      } else {
        alert(data.error || 'Failed to create inventory item');
      }
    } catch (error) {
      console.error('Failed to create inventory item:', error);
      alert('Failed to create inventory item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/inventory');
  };

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
              <Heading size="8" mb="1">New Inventory Item</Heading>
              <Text size="2" color="gray">Add a new item to inventory</Text>
            </Box>
          </Flex>

          {/* Form Card */}
          <Card size="2" variant="surface">
            {submitting ? (
              <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '200px' }}>
                <Spinner size="3" />
                <Text size="2" color="gray">Creating inventory item...</Text>
              </Flex>
            ) : (
              <InventoryForm
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

