'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Heading, IconButton, Container, Section } from '@radix-ui/themes';

interface Invoice {
  _id: string;
  invoiceNumber: string;
  patient: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  total?: number;
  status: 'unpaid' | 'partial' | 'paid' | 'refunded';
  createdAt: string;
}

export default function InvoicesPageClient() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await fetch('/api/invoices');
      
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
        setInvoices(data.data);
      } else {
        console.error('Failed to fetch invoices:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'paid':
        return 'green';
      case 'partial':
        return 'yellow';
      case 'unpaid':
        return 'red';
      case 'refunded':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const filteredInvoices = invoices.filter(invoice => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const patientName = `${invoice.patient?.firstName || ''} ${invoice.patient?.lastName || ''}`.toLowerCase();
      const invoiceNumber = (invoice.invoiceNumber || '').toLowerCase();
      if (!patientName.includes(query) && !invoiceNumber.includes(query)) return false;
    }
    if (filterStatus !== 'all' && invoice.status !== filterStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" align="center" justify="center" gap="3" style={{ minHeight: '256px' }}>
            <Spinner size="3" />
            <Text>Loading invoices...</Text>
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
          <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3">
            <Box>
              <Heading size="8" mb="1">Billing & Invoices</Heading>
              <Text size="2" color="gray">Manage invoices and payments</Text>
            </Box>
            <Button asChild size="3">
              <Link href="/invoices/new">
                <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Invoice
              </Link>
            </Button>
          </Flex>

          {/* Search and Filters */}
          <Card>
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
                  placeholder="Search by patient name or invoice number..."
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
                  <Select.Item value="unpaid">Unpaid</Select.Item>
                  <Select.Item value="partial">Partial</Select.Item>
                  <Select.Item value="paid">Paid</Select.Item>
                  <Select.Item value="refunded">Refunded</Select.Item>
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

          {/* Invoices Table */}
          <Card>
            <Box p="3">
              <Flex justify="between" align="center" mb="3">
                <Heading size="4">Invoices</Heading>
            <Text size="2" color="gray">
              {filteredInvoices.length} {filteredInvoices.length === 1 ? 'invoice' : 'invoices'}
            </Text>
          </Flex>
          {filteredInvoices.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterStatus !== 'all' ? 'No invoices match your filters' : 'No invoices found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Create your first invoice to get started'}
              </Text>
              {!searchQuery && filterStatus === 'all' && (
                <Button asChild>
                  <Link href="/invoices/new">
                    <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Invoice
                  </Link>
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Invoice Number</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Total</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredInvoices.map((invoice) => (
                  <Table.Row key={invoice._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">{invoice.invoiceNumber}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {invoice.patient?._id ? (
                        <Link href={`/patients/${invoice.patient._id}`}>
                          <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                            {invoice.patient.firstName} {invoice.patient.lastName}
                          </Text>
                        </Link>
                      ) : (
                        <Text size="2">
                          {invoice.patient?.firstName} {invoice.patient?.lastName}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" weight="medium">
                        ₱{invoice.total?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(invoice.status)} size="1">
                        {invoice.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {new Date(invoice.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Button asChild size="1" variant="soft" color="blue">
                        <Link href={`/invoices/${invoice._id}`}>
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
        </Flex>
      </Container>
    </Section>
  );
}
