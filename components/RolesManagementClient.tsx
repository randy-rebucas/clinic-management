'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Flex, Box, Text, TextField, Select, Separator, Heading, Switch, Tabs, Spinner, Callout, Container, Section, Dialog, Badge, AlertDialog, Table } from '@radix-ui/themes';
import { PlusIcon, Pencil1Icon, TrashIcon, CheckIcon, Cross2Icon } from '@radix-ui/react-icons';

interface Permission {
  resource: string;
  actions: string[];
}

interface Role {
  _id: string;
  name: string;
  displayName: string;
  description?: string;
  level?: number;
  isActive: boolean;
  defaultPermissions?: Permission[];
  permissions?: any[];
}

const RESOURCES = [
  'patients', 'appointments', 'visits', 'prescriptions', 'lab-results',
  'invoices', 'doctors', 'reports', 'queue', 'referrals', 'documents',
  'inventory', 'medicines', 'settings'
];

const ACTIONS = ['read', 'write', 'update', 'delete'];

export default function RolesManagementClient() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<string | null>(null);
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    level: 0,
    isActive: true,
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/roles');
      const data = await response.json();
      
      if (data.success) {
        setRoles(data.data);
      } else {
        setError(data.error || 'Failed to fetch roles');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRole(null);
    setFormData({
      name: '',
      displayName: '',
      description: '',
      level: 0,
      isActive: true,
    });
    setShowForm(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description || '',
      level: role.level || 0,
      isActive: role.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    try {
      setError(null);
      const url = editingRole ? `/api/roles/${editingRole._id}` : '/api/roles';
      const method = editingRole ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess(editingRole ? 'Role updated successfully' : 'Role created successfully');
        setShowForm(false);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save role');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;

    try {
      setError(null);
      const response = await fetch(`/api/roles/${roleToDelete}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Role deleted successfully');
        setDeleteDialogOpen(false);
        setRoleToDelete(null);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to delete role');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
    }
  };

  const handleManagePermissions = (role: Role) => {
    setSelectedRole(role);
    setPermissions(role.defaultPermissions || []);
    setShowPermissionsDialog(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;

    try {
      setError(null);
      const response = await fetch(`/api/roles/${selectedRole._id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPermissions: permissions }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Permissions updated successfully');
        setShowPermissionsDialog(false);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update permissions');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
    }
  };

  const togglePermission = (resource: string, action: string) => {
    setPermissions(prev => {
      const existing = prev.find(p => p.resource === resource);
      if (existing) {
        if (existing.actions.includes(action)) {
          const newActions = existing.actions.filter(a => a !== action);
          if (newActions.length === 0) {
            return prev.filter(p => p.resource !== resource);
          }
          return prev.map(p => 
            p.resource === resource 
              ? { ...p, actions: newActions }
              : p
          );
        } else {
          return prev.map(p => 
            p.resource === resource 
              ? { ...p, actions: [...p.actions, action] }
              : p
          );
        }
      } else {
        return [...prev, { resource, actions: [action] }];
      }
    });
  };

  const hasPermission = (resource: string, action: string) => {
    const perm = permissions.find(p => p.resource === resource || p.resource === '*');
    if (!perm) return false;
    return perm.actions.includes(action) || perm.actions.includes('*');
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
        <Flex justify="between" align="center" mb="4">
          <Heading size="8">Roles Management</Heading>
          <Button onClick={handleCreate}>
            <PlusIcon /> Create Role
          </Button>
        </Flex>

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
                <Table.ColumnHeaderCell>Display Name</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Level</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Status</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Permissions</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {roles.map((role) => (
                <Table.Row key={role._id}>
                  <Table.Cell>
                    <Text weight="medium">{role.name}</Text>
                  </Table.Cell>
                  <Table.Cell>{role.displayName}</Table.Cell>
                  <Table.Cell>{role.level || 0}</Table.Cell>
                  <Table.Cell>
                    <Badge color={role.isActive ? 'green' : 'red'}>
                      {role.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" color="gray">
                      {(role.defaultPermissions?.length || 0) + (role.permissions?.length || 0)} permissions
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2">
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => handleManagePermissions(role)}
                      >
                        Permissions
                      </Button>
                      <Button
                        size="1"
                        variant="soft"
                        onClick={() => handleEdit(role)}
                      >
                        <Pencil1Icon /> Edit
                      </Button>
                      {role.name !== 'admin' && (
                        <Button
                          size="1"
                          variant="soft"
                          color="red"
                          onClick={() => {
                            setRoleToDelete(role._id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <TrashIcon /> Delete
                        </Button>
                      )}
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>

        {/* Create/Edit Role Dialog */}
        <Dialog.Root open={showForm} onOpenChange={setShowForm}>
          <Dialog.Content style={{ maxWidth: 500 }}>
            <Dialog.Title>
              {editingRole ? 'Edit Role' : 'Create Role'}
            </Dialog.Title>
            <Separator my="3" size="4" />
            
            <Flex direction="column" gap="3">
              <Box>
                <Text size="2" weight="medium" mb="1">Role Name</Text>
                <Select.Root
                  value={formData.name}
                  onValueChange={(value) => setFormData({ ...formData, name: value })}
                >
                  <Select.Trigger placeholder="Select role name" />
                  <Select.Content>
                    <Select.Item value="admin">Admin</Select.Item>
                    <Select.Item value="doctor">Doctor</Select.Item>
                    <Select.Item value="nurse">Nurse</Select.Item>
                    <Select.Item value="receptionist">Receptionist</Select.Item>
                    <Select.Item value="accountant">Accountant</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1">Display Name</Text>
                <TextField.Root
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Enter display name"
                />
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1">Description</Text>
                <TextField.Root
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter description"
                />
              </Box>

              <Box>
                <Text size="2" weight="medium" mb="1">Level</Text>
                <TextField.Root
                  type="number"
                  value={formData.level.toString()}
                  onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 0 })}
                  placeholder="Enter level"
                />
              </Box>

              <Flex align="center" gap="2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Text size="2">Active</Text>
              </Flex>
            </Flex>

            <Flex gap="3" mt="4" justify="end">
              <Button variant="soft" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingRole ? 'Update' : 'Create'}
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        {/* Permissions Dialog */}
        <Dialog.Root open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
          <Dialog.Content style={{ maxWidth: 800, maxHeight: '80vh', overflow: 'auto' }}>
            <Dialog.Title>
              Manage Permissions - {selectedRole?.displayName}
            </Dialog.Title>
            <Separator my="3" size="4" />
            
            <Box>
              <Text size="2" color="gray" mb="4">
                Select permissions for this role. Permissions can be resource-specific or use wildcards (*).
              </Text>

              <Card>
                <Table.Root>
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeaderCell>Resource</Table.ColumnHeaderCell>
                      {ACTIONS.map(action => (
                        <Table.ColumnHeaderCell key={action} style={{ textAlign: 'center' }}>
                          {action}
                        </Table.ColumnHeaderCell>
                      ))}
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {RESOURCES.map(resource => (
                      <Table.Row key={resource}>
                        <Table.Cell>
                          <Text weight="medium">{resource}</Text>
                        </Table.Cell>
                        {ACTIONS.map(action => (
                          <Table.Cell key={action} style={{ textAlign: 'center' }}>
                            <Button
                              size="1"
                              variant={hasPermission(resource, action) ? 'solid' : 'soft'}
                              color={hasPermission(resource, action) ? 'green' : 'gray'}
                              onClick={() => togglePermission(resource, action)}
                            >
                              {hasPermission(resource, action) ? <CheckIcon /> : <Cross2Icon />}
                            </Button>
                          </Table.Cell>
                        ))}
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Card>
            </Box>

            <Flex gap="3" mt="4" justify="end">
              <Button variant="soft" onClick={() => setShowPermissionsDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSavePermissions}>
                Save Permissions
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        {/* Delete Confirmation Dialog */}
        <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialog.Content>
            <AlertDialog.Title>Delete Role</AlertDialog.Title>
            <AlertDialog.Description>
              Are you sure you want to delete this role? This action cannot be undone.
              Users with this role will need to be reassigned.
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button color="red" onClick={handleDelete}>Delete</Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Section>
    </Container>
  );
}

