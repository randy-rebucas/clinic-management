'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Flex, Box, Text, Select, Separator, Heading, Spinner, Callout, Container, Section, Table, Dialog, Badge } from '@radix-ui/themes';
import { Pencil1Icon } from '@radix-ui/react-icons';

interface Role {
  _id: string;
  name: string;
  displayName: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: Role | string;
  status: string;
}

export default function UserRoleManagementClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  useEffect(() => {
    fetchUsers();
    fetchRoles();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/staff');
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch('/api/roles');
      const data = await response.json();
      
      if (data.success) {
        setRoles(data.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch roles:', err);
    }
  };

  const handleEditRole = (user: User) => {
    setEditingUser(user);
    const roleId = typeof user.role === 'object' ? user.role._id : user.role;
    setSelectedRoleId(roleId || '');
  };

  const handleSaveRole = async () => {
    if (!editingUser || !selectedRoleId) return;

    try {
      setError(null);
      const response = await fetch(`/api/users/${editingUser._id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRoleId }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('User role updated successfully');
        setEditingUser(null);
        fetchUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update user role');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
    }
  };

  const getRoleName = (user: User) => {
    if (typeof user.role === 'object') {
      return user.role.displayName || user.role.name;
    }
    return 'Unknown';
  };

  if (loading) {
    return (
      <Container size="4">
        <Flex justify="center" align="center" style={{ minHeight: '400px' }}>
          <Spinner size="3" />
        </Flex>
      </Container>
    );
  }

  return (
    <Container size="4" py="6">
      <Section>
        <Heading size="8" mb="4">User Role Management</Heading>

        {error && (
          <Callout.Root color="red" mb="4">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {success && (
          <Callout.Root color="green" mb="4">
            <Callout.Text>{success}</Callout.Text>
          </Callout.Root>
        )}

        <Card>
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Current Role</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {users.map((user) => (
                <Table.Row key={user._id}>
                  <Table.Cell>
                    <Text weight="medium">{user.name}</Text>
                  </Table.Cell>
                  <Table.Cell>{user.email}</Table.Cell>
                  <Table.Cell>
                    <Badge>{getRoleName(user)}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={user.status === 'active' ? 'green' : 'red'}>
                      {user.status}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Button
                      size="1"
                      variant="soft"
                      onClick={() => handleEditRole(user)}
                    >
                      <Pencil1Icon /> Change Role
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>

        {/* Edit Role Dialog */}
        <Dialog.Root open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <Dialog.Content style={{ maxWidth: 400 }}>
            <Dialog.Title>Change User Role</Dialog.Title>
            <Separator my="3" size="4" />
            
            {editingUser && (
              <Flex direction="column" gap="3">
                <Box>
                  <Text size="2" weight="medium" mb="1">User</Text>
                  <Text>{editingUser.name} ({editingUser.email})</Text>
                </Box>

                <Box>
                  <Text size="2" weight="medium" mb="1">Select Role</Text>
                  <Select.Root
                    value={selectedRoleId}
                    onValueChange={setSelectedRoleId}
                  >
                    <Select.Trigger placeholder="Select role" />
                    <Select.Content>
                      {roles.map((role) => (
                        <Select.Item key={role._id} value={role._id}>
                          {role.displayName}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Box>
              </Flex>
            )}

            <Flex gap="3" mt="4" justify="end">
              <Button variant="soft" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveRole} disabled={!selectedRoleId}>
                Save
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Section>
    </Container>
  );
}

