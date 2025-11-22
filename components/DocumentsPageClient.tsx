'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Heading, IconButton } from '@radix-ui/themes';

interface Document {
  _id: string;
  documentCode: string;
  title: string;
  category: string;
  documentType: string;
  patient?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  uploadDate: string;
  status: 'active' | 'archived' | 'deleted';
}

export default function DocumentsPageClient() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      
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
        setDocuments(data.data);
      } else {
        console.error('Failed to fetch documents:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDocuments = documents.filter(doc => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const title = (doc.title || '').toLowerCase();
      const documentCode = (doc.documentCode || '').toLowerCase();
      const patientName = doc.patient ? `${doc.patient.firstName} ${doc.patient.lastName}`.toLowerCase() : '';
      if (!title.includes(query) && !documentCode.includes(query) && !patientName.includes(query)) return false;
    }
    if (filterCategory !== 'all' && doc.category !== filterCategory) return false;
    if (filterStatus !== 'all' && doc.status !== filterStatus) return false;
    return true;
  });

  const categories = Array.from(new Set(documents.map(d => d.category)));

  if (loading) {
    return (
      <Box p="4" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Flex direction="column" align="center" gap="3">
          <Spinner size="3" />
          <Text>Loading documents...</Text>
        </Flex>
      </Box>
    );
  }

  return (
    <Box p="4">
      {/* Header */}
      <Flex direction={{ initial: 'column', sm: 'row' }} justify="between" align={{ sm: 'center' }} gap="3" mb="3">
        <Box>
          <Heading size="7" mb="1">Documents</Heading>
          <Text size="2" color="gray">Manage clinic documents</Text>
        </Box>
        <Button asChild size="3">
          <Link href="/documents/upload">
            <svg style={{ width: '16px', height: '16px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload Document
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
                  placeholder="Search by title, document code, or patient name..."
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
                value={filterCategory}
                onValueChange={(value) => setFilterCategory(value)}
              >
                <Select.Trigger placeholder="All Categories" />
                <Select.Content>
                  <Select.Item value="all">All Categories</Select.Item>
                  {categories.map((cat) => (
                    <Select.Item key={cat} value={cat}>
                      {cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Box>
            <Box style={{ minWidth: '180px' }}>
              <Select.Root
                value={filterStatus}
                onValueChange={(value) => setFilterStatus(value)}
              >
                <Select.Trigger placeholder="All Statuses" />
                <Select.Content>
                  <Select.Item value="all">All Statuses</Select.Item>
                  <Select.Item value="active">Active</Select.Item>
                  <Select.Item value="archived">Archived</Select.Item>
                  <Select.Item value="deleted">Deleted</Select.Item>
                </Select.Content>
              </Select.Root>
            </Box>
            {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
              <Button
                onClick={() => {
                  setSearchQuery('');
                  setFilterCategory('all');
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

      {/* Documents Table */}
      <Card>
        <Box p="3">
          <Flex justify="between" align="center" mb="3">
            <Heading size="3">Documents</Heading>
            <Text size="2" color="gray">
              {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
            </Text>
          </Flex>
          {filteredDocuments.length === 0 ? (
            <Box p="8" style={{ textAlign: 'center' }}>
              <Box mb="3">
                <svg style={{ width: '48px', height: '48px', margin: '0 auto', color: 'var(--gray-9)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </Box>
              <Heading size="3" mb="1">
                {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No documents match your filters' : 'No documents found'}
              </Heading>
              <Text size="2" color="gray" mb="3" as="div">
                {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Upload your first document to get started'}
              </Text>
              {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                <Button asChild>
                  <Link href="/documents/upload">
                    <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Upload Document
                  </Link>
                </Button>
              )}
            </Box>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Document Code</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Category</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Patient</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Upload Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredDocuments.map((doc) => (
                  <Table.Row key={doc._id}>
                    <Table.Cell>
                      <Text size="2" weight="medium">{doc.documentCode}</Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.title}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {doc.category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="1" variant="soft">
                        {doc.documentType.toUpperCase()}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {doc.patient?._id ? (
                        <Link href={`/patients/${doc.patient._id}`}>
                          <Text size="2" weight="medium" style={{ color: 'var(--blue-9)', textDecoration: 'none' }}>
                            {doc.patient.firstName} {doc.patient.lastName}
                          </Text>
                        </Link>
                      ) : (
                        <Text size="2" color="gray">N/A</Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" color="gray">
                        {new Date(doc.uploadDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </Table.Cell>
                    <Table.Cell style={{ textAlign: 'right' }}>
                      <Button asChild size="1" variant="soft" color="blue">
                        <Link href={`/documents/${doc._id}`}>
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
