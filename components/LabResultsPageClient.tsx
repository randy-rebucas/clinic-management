'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Skeleton, Heading, IconButton } from '@radix-ui/themes';

interface LabResult {
  _id: string;
  requestCode?: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  request: {
    testType: string;
    urgency?: string;
  };
  status: 'ordered' | 'in-progress' | 'completed' | 'reviewed' | 'cancelled';
  orderDate: string;
  resultDate?: string;
}

export default function LabResultsPageClient() {
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchLabResults();
  }, []);

  const fetchLabResults = async () => {
    try {
      const res = await fetch('/api/lab-results');
      
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
        setLabResults(data.data);
      } else {
        console.error('Failed to fetch lab results:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch lab results:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'gray' | 'red' => {
    switch (status) {
      case 'reviewed':
        return 'green';
      case 'completed':
        return 'blue';
      case 'in-progress':
        return 'yellow';
      case 'ordered':
        return 'gray';
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const filteredLabResults = labResults.filter(lab => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${lab.patient?.firstName || ''} ${lab.patient?.lastName || ''}`.toLowerCase();
      const requestCode = (lab.requestCode || '').toLowerCase();
      const testType = (lab.request?.testType || '').toLowerCase();
      if (!patientName.includes(query) && !requestCode.includes(query) && !testType.includes(query)) return false;
    }
    if (filterStatus !== 'all' && lab.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <Box p="4">
        <Flex direction="column" gap="3">
          <Skeleton height="32px" width="200px" />
          <Skeleton height="40px" />
          <Skeleton height="300px" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3" mb="3">
        <Box>
          <Heading size="7" mb="1">Lab Results</Heading>
          <Text size="2" color="gray">Manage laboratory test results</Text>
        </Box>
        <Button asChild size="3">
          <Link href="/lab-results/new">
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Lab Order
          </Link>
        </Button>
      </Flex>

      {/* Search and Filters */}
      <Card mb="3">
        <Box p="3">
          <Flex direction={{ initial: 'column', sm: 'row' }} gap="3">
            <Box flexGrow="1">
              <TextField.Root size="2" style={{ width: '100%' }}>
                <TextField.Slot>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.3333 11.3333L14 14M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                </TextField.Slot>
                <input
                  type="text"
                  placeholder="Search by patient name, request code, or test type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ 
                    all: 'unset', 
                    flex: 1, 
                    width: '100%',
                    padding: '0',
                    fontSize: 'var(--font-size-2)',
                    lineHeight: 'var(--line-height-2)'
                  }}
                />
                {searchQuery && (
                  <TextField.Slot>
                    <IconButton
                      size="1"
                      variant="ghost"
                      onClick={() => setSearchQuery('')}
                      style={{ cursor: 'pointer' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 3L3 9M3 3L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </IconButton>
                  </TextField.Slot>
                )}
              </TextField.Root>
            </Box>
            <Box style={{ minWidth: '180px' }}>
              <Select.Root
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <Select.Trigger placeholder="All Statuses" />
                <Select.Content>
                  <Select.Item value="all">All Statuses</Select.Item>
                  <Select.Item value="ordered">Ordered</Select.Item>
                  <Select.Item value="in-progress">In Progress</Select.Item>
                  <Select.Item value="completed">Completed</Select.Item>
                  <Select.Item value="reviewed">Reviewed</Select.Item>
                  <Select.Item value="cancelled">Cancelled</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            {(searchQuery || filterStatus !== 'all') && (
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                }}
                variant="soft"
                size="2"
              >
                Clear
              </Button>
            )}
          </Flex>
        </Box>
      </Card>

      {/* Lab Results Table */}
      <Card>
        <Box p="3">
          <Flex justify="between" align="center" mb="3">
            <Heading size="3">Lab Results</Heading>
            <Text size="2" color="gray">
              {filteredLabResults.length} {filteredLabResults.length === 1 ? 'result' : 'results'}
            </Text>
          </Flex>
          {filteredLabResults.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterStatus !== 'all' ? 'No lab results match your filters' : 'No lab results found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first lab order to get started'}
              </Text>
              {!searchQuery && filterStatus === 'all' && (
                <Button asChild>
                  <Link href="/lab-results/new">
                    <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Lab Order
                  </Link>
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Request Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Test Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Order Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredLabResults.map((lab) => (
                  <Table.Row key={lab._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">{lab.requestCode || 'N/A'}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {lab.patient?._id ? (
                        <Link href={`/patients/${lab.patient._id}`}>
                          <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                            {lab.patient.firstName} {lab.patient.lastName}
                          </Text>
                        </Link>
                      ) : (
                        <Text size="2">
                          {lab.patient?.firstName} {lab.patient?.lastName}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="2">{lab.request?.testType || 'N/A'}</Text>
                        {lab.request?.urgency && (
                          <Badge size="1" color="orange" variant="soft">
                            {lab.request.urgency} priority
                          </Badge>
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(lab.status)} size="1">
                        {lab.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Text size="2">
                          {new Date(lab.orderDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        {lab.resultDate && (
                          <Text size="1" color="gray">
                            Result: {new Date(lab.resultDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </Text>
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Button asChild size="1" variant="soft" color="blue">
                        <Link href={`/lab-results/${lab._id}`}>
                          View
                        </Link>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
        </Box>
      </Card>
    </Box>
  );
}
