'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Heading, IconButton } from '@radix-ui/themes';

interface Referral {
  _id: string;
  referralCode: string;
  type: 'doctor_to_doctor' | 'patient_to_patient' | 'external';
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  referringDoctor?: {
    firstName: string;
    lastName: string;
  };
  receivingDoctor?: {
    firstName: string;
    lastName: string;
  };
  status: 'pending' | 'accepted' | 'completed' | 'declined' | 'cancelled';
  referredDate: string;
  urgency: 'routine' | 'urgent' | 'stat';
}

export default function ReferralsPageClient() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchReferrals();
  }, []);

  const fetchReferrals = async () => {
    try {
      const res = await fetch('/api/referrals');
      
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
        setReferrals(data.data);
      } else {
        console.error('Failed to fetch referrals:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch referrals:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'blue' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'accepted':
        return 'blue';
      case 'pending':
        return 'yellow';
      case 'declined':
      case 'cancelled':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getUrgencyColor = (urgency: string): 'red' | 'orange' | 'gray' => {
    switch (urgency) {
      case 'stat':
        return 'red';
      case 'urgent':
        return 'orange';
      case 'routine':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const filteredReferrals = referrals.filter(referral => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${referral.patient?.firstName || ''} ${referral.patient?.lastName || ''}`.toLowerCase();
      const referralCode = (referral.referralCode || '').toLowerCase();
      const referringDoctor = referral.referringDoctor 
        ? `${referral.referringDoctor.firstName} ${referral.referringDoctor.lastName}`.toLowerCase()
        : '';
      if (!patientName.includes(query) && !referralCode.includes(query) && !referringDoctor.includes(query)) return false;
    }
    if (filterStatus !== 'all' && referral.status !== filterStatus) return false;
    if (filterType !== 'all' && referral.type !== filterType) return false;
    return true;
  });

  if (loading) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading referrals...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3" mb="3">
        <Box>
          <Heading size="7" mb="1">Referrals</Heading>
          <Text size="2" color="gray">Manage patient referrals</Text>
        </Box>
        <Button asChild size="3">
          <Link href="/referrals/new">
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Referral
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
                  placeholder="Search by patient name, referral code, or referring doctor..."
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
                  <Select.Item value="pending">Pending</Select.Item>
                  <Select.Item value="accepted">Accepted</Select.Item>
                  <Select.Item value="completed">Completed</Select.Item>
                  <Select.Item value="declined">Declined</Select.Item>
                  <Select.Item value="cancelled">Cancelled</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            <Box style={{ minWidth: '180px' }}>
              <Select.Root
                value={filterType}
                onValueChange={(value) => setFilterType(value)}
              >
                <Select.Trigger placeholder="All Types" />
                <Select.Content>
                  <Select.Item value="all">All Types</Select.Item>
                  <Select.Item value="doctor_to_doctor">Doctor to Doctor</Select.Item>
                  <Select.Item value="patient_to_patient">Patient to Patient</Select.Item>
                  <Select.Item value="external">External</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            {(searchQuery || filterStatus !== 'all' || filterType !== 'all') && (
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setFilterStatus('all');
                  setFilterType('all');
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

      {/* Referrals Table */}
      <Card>
        <Box p="3">
          <Flex justify="between" align="center" mb="3">
            <Heading size="3">Referrals</Heading>
            <Text size="2" color="gray">
              {filteredReferrals.length} {filteredReferrals.length === 1 ? 'referral' : 'referrals'}
            </Text>
          </Flex>
          {filteredReferrals.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'No referrals match your filters' : 'No referrals found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterStatus !== 'all' || filterType !== 'all' ? 'Try adjusting your search or filters' : 'Create your first referral to get started'}
              </Text>
              {!searchQuery && filterStatus === 'all' && filterType === 'all' && (
                <Button asChild>
                  <Link href="/referrals/new">
                    <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    New Referral
                  </Link>
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Referral Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Referring Doctor</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Urgency</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredReferrals.map((referral) => (
                  <Table.Row key={referral._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">{referral.referralCode}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {referral.patient?._id ? (
                        <Link href={`/patients/${referral.patient._id}`}>
                          <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                            {referral.patient.firstName} {referral.patient.lastName}
                          </Text>
                        </Link>
                      ) : (
                        <Text size="2">
                          {referral.patient?.firstName} {referral.patient?.lastName}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
                        {referral.type.replace('_', ' ')}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {referral.referringDoctor ? (
                        <Text size="2">
                          {referral.referringDoctor.firstName} {referral.referringDoctor.lastName}
                        </Text>
                      ) : (
                        <Text size="2" color="gray">N/A</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(referral.status)} size="1">
                        {referral.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getUrgencyColor(referral.urgency)} size="1" variant="soft">
                        {referral.urgency}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {new Date(referral.referredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Button asChild size="1" variant="soft" color="blue">
                        <Link href={`/referrals/${referral._id}`}>
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
