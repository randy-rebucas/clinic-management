'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, TextField, Select, Table, Dialog, Card, Flex, Box, Text, Spinner, Badge, Skeleton, Heading, Callout, IconButton, Container, Section } from '@radix-ui/themes';

interface InventoryItem {
  _id: string;
  name: string;
  category: 'medicine' | 'supply' | 'equipment' | 'other';
  quantity: number;
  unit: string;
  reorderLevel: number;
  status: 'in-stock' | 'low-stock' | 'out-of-stock' | 'expired';
  expiryDate?: string;
}

export default function InventoryPageClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const router = useRouter();

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      
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
        setItems(data.data);
      } else {
        console.error('Failed to fetch inventory:', data.error);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): 'green' | 'yellow' | 'red' | 'gray' => {
    switch (status) {
      case 'in-stock':
        return 'green';
      case 'low-stock':
        return 'yellow';
      case 'out-of-stock':
        return 'red';
      case 'expired':
        return 'red';
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <Section size="3">
        <Container size="4">
          <Flex direction="column" gap="3">
            <Skeleton height="32px" width="200px" />
            <Flex gap="3" wrap="wrap">
              <Skeleton height="100px" style={{ flex: '1 1 200px' }} />
              <Skeleton height="100px" style={{ flex: '1 1 200px' }} />
              <Skeleton height="100px" style={{ flex: '1 1 200px' }} />
            </Flex>
            <Skeleton height="400px" />
          </Flex>
        </Container>
      </Section>
    );
  }

  const filteredItems = items.filter(item => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = (item.name || '').toLowerCase();
      if (!name.includes(query)) return false;
    }
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    return true;
  });

  const lowStockItems = filteredItems.filter(item => item.status === 'low-stock' || item.status === 'out-of-stock');

  return (
    <Section size="3">
      <Container size="4">
        <Flex direction="column" gap="4">
          {/* Header */}
          <Flex direction={{ initial: 'column', sm: 'row' }} align={{ sm: 'center' }} justify="between" gap="3">
            <Box>
              <Heading size="8" mb="1">Inventory Management</Heading>
              <Text size="2" color="gray">Track medicines and supplies</Text>
            </Box>
            <Button asChild size="3">
              <Link href="/inventory/new">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </Link>
            </Button>
          </Flex>

          {/* Low Stock Alert */}
          {lowStockItems.length > 0 && (
            <Callout.Root color="yellow" size="2">
              <Callout.Icon>
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </Callout.Icon>
              <Callout.Text size="2">
                {lowStockItems.length} item(s) need restocking
              </Callout.Text>
            </Callout.Root>
          )}

          {/* Search and Filters */}
          <Flex direction="column" gap="2">
          <Box position="relative" style={{ width: '100%' }}>
            <TextField.Root>
              <TextField.Slot side="left">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gray-9)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </TextField.Slot>
              <input
                type="text"
                placeholder="Search by item name..."
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value || '')}
                style={{ all: 'unset', flex: 1 }}
              />
              {searchQuery && (
                <TextField.Slot side="right">
                  <IconButton
                    size="1"
                    variant="ghost"
                    onClick={() => setSearchQuery('')}
                    style={{ cursor: 'pointer' }}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                </TextField.Slot>
              )}
            </TextField.Root>
          </Box>
          <Flex gap="2" wrap="wrap">
            <Select.Root value={filterCategory || 'all'} onValueChange={(value) => setFilterCategory(value || 'all')}>
              <Select.Trigger style={{ minWidth: '150px' }} />
              <Select.Content>
                <Select.Item value="all">All Categories</Select.Item>
                <Select.Item value="medicine">Medicine</Select.Item>
                <Select.Item value="supply">Supply</Select.Item>
                <Select.Item value="equipment">Equipment</Select.Item>
                <Select.Item value="other">Other</Select.Item>
              </Select.Content>
            </Select.Root>
            <Select.Root value={filterStatus || 'all'} onValueChange={(value) => setFilterStatus(value || 'all')}>
              <Select.Trigger style={{ minWidth: '150px' }} />
              <Select.Content>
                <Select.Item value="all">All Statuses</Select.Item>
                <Select.Item value="in-stock">In Stock</Select.Item>
                <Select.Item value="low-stock">Low Stock</Select.Item>
                <Select.Item value="out-of-stock">Out of Stock</Select.Item>
                <Select.Item value="expired">Expired</Select.Item>
              </Select.Content>
            </Select.Root>
            {(searchQuery || filterCategory !== 'all' || filterStatus !== 'all') && (
              <Button
                variant="soft"
                size="2"
                onClick={() => {
                  setSearchQuery('');
                  setFilterCategory('all');
                  setFilterStatus('all');
                }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </Button>
            )}
          </Flex>
        </Flex>

          {/* Inventory Table */}
          <Card>
            <Flex p="3" justify="between" align="center" style={{ borderBottom: '1px solid var(--gray-6)' }}>
              <Heading size="4">Inventory Items</Heading>
              <Text size="2" color="gray">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
              </Text>
            </Flex>
          <Box style={{ overflowX: 'auto' }}>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Item Name</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Category</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Quantity</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Unit</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Reorder Level</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Expiry Date</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={{ textAlign: 'right' }}>Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredItems.length === 0 ? (
                  <Table.Row>
                    <Table.Cell colSpan={8} style={{ textAlign: 'center', padding: '24px' }}>
                      <Flex direction="column" align="center" gap="2">
                        <Box>
                          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--gray-9)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </Box>
                        <Text size="2" weight="medium">
                          {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'No items match your filters' : 'No inventory items found'}
                        </Text>
                        <Text size="2" color="gray" mb="2">
                          {searchQuery || filterCategory !== 'all' || filterStatus !== 'all' ? 'Try adjusting your search or filters' : 'Add your first inventory item to get started'}
                        </Text>
                        {!searchQuery && filterCategory === 'all' && filterStatus === 'all' && (
                          <Button asChild size="2">
                            <Link href="/inventory/new">
                              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ marginRight: '4px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                              Add Item
                            </Link>
                          </Button>
                        )}
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ) : (
                  filteredItems.map((item) => (
                    <Table.Row key={item._id}>
                      <Table.RowHeaderCell>
                        <Text size="2" weight="medium">{item.name}</Text>
                      </Table.RowHeaderCell>
                      <Table.Cell>
                        <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>{item.category}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" weight="medium">{item.quantity}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{item.unit}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">{item.reorderLevel}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={getStatusColor(item.status)} size="1">
                          {item.status.replace('-', ' ')}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" color="gray">
                          {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <Text color="gray">N/A</Text>}
                        </Text>
                      </Table.Cell>
                      <Table.Cell style={{ textAlign: 'right' }}>
                        <Button asChild variant="ghost" size="1">
                          <Link href={`/inventory/${item._id}`}>
                            View →
                          </Link>
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))
                )}
              </Table.Body>
            </Table.Root>
          </Box>
        </Card>
        </Flex>
      </Container>
    </Section>
  );
}

