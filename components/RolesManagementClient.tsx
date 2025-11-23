'use client';

import { useEffect, useState } from 'react';
import { Modal, AlertDialog } from './ui/Modal';

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
      setError(null);
      const response = await fetch('/api/roles');
      
      if (!response.ok) {
        // Try to parse error message from response
        let errorMessage = 'Failed to fetch roles';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        
        if (response.status === 401) {
          errorMessage = 'Unauthorized. Please log in.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Admin privileges required.';
        }
        
        setError(errorMessage);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        setRoles(data.data);
      } else {
        setError(data.error || 'Failed to fetch roles');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch roles');
      setTimeout(() => setError(null), 5000);
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

      if (!response.ok) {
        let errorMessage = 'Failed to save role';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        setError(errorMessage);
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        setSuccess(editingRole ? 'Role updated successfully!' : 'Role created successfully!');
        setShowForm(false);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save role');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save role');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;

    try {
      setError(null);
      const response = await fetch(`/api/roles/${roleToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to delete role';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        setError(errorMessage);
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Role deleted successfully!');
        setDeleteDialogOpen(false);
        setRoleToDelete(null);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to delete role');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete role');
      setTimeout(() => setError(null), 5000);
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

      if (!response.ok) {
        let errorMessage = 'Failed to update permissions';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        setError(errorMessage);
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        setSuccess('Permissions updated successfully!');
        setShowPermissionsDialog(false);
        fetchRoles();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update permissions');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update permissions');
      setTimeout(() => setError(null), 5000);
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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading roles...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-green-800 text-sm">{success}</p>
            </div>
          )}

          {/* Header */}
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
              <div>
                <h1 className="text-3xl font-bold mb-1">Roles Management</h1>
                <p className="text-sm text-gray-500">Manage user roles and permissions</p>
              </div>
              <button
                onClick={handleCreate}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Role
              </button>
            </div>
          </div>

          {/* Roles Table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {roles.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No roles</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating a new role.</p>
                <div className="mt-6">
                  <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Create Role
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Display Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Level</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Permissions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {roles.map((role) => (
                      <tr key={role._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-sm">{role.name}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{role.displayName}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{role.level || 0}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            role.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {role.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-gray-500">
                            {(role.defaultPermissions?.length || 0) + (role.permissions?.length || 0)} permissions
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleManagePermissions(role)}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                            >
                              Permissions
                            </button>
                            <button
                              onClick={() => handleEdit(role)}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M11.3333 1.99999C11.5084 1.82488 11.7163 1.68698 11.9444 1.59499C12.1726 1.503 12.4163 1.45898 12.6622 1.46599C12.9081 1.473 13.1511 1.53088 13.3752 1.63606C13.5993 1.74124 13.7998 1.89139 13.9648 2.07732C14.1298 2.26325 14.2557 2.4809 14.3353 2.71728C14.4149 2.95366 14.4464 3.20399 14.428 3.45332C14.4096 3.70265 14.3416 3.946 14.2277 4.16866C14.1138 4.39132 13.9564 4.58866 13.7647 4.74866L5.528 13L1.33333 14L2.33333 9.80533L10.57 1.57066L11.3333 1.99999Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              Edit
                            </button>
                            {role.name !== 'admin' && (
                              <button
                                onClick={() => {
                                  setRoleToDelete(role._id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors flex items-center gap-1"
                              >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2 4H14M12.6667 4V13.3333C12.6667 13.687 12.5262 14.0261 12.2761 14.2761C12.0261 14.5262 11.687 14.6667 11.3333 14.6667H4.66667C4.31305 14.6667 3.97391 14.5262 3.72386 14.2761C3.47381 14.0261 3.33333 13.687 3.33333 13.3333V4M5.33333 4V2.66667C5.33333 2.31305 5.47381 1.97391 5.72386 1.72386C5.97391 1.47381 6.31305 1.33333 6.66667 1.33333H9.33333C9.68696 1.33333 10.0261 1.47381 10.2761 1.72386C10.5262 1.97391 10.6667 2.31305 10.6667 2.66667V4M6.66667 7.33333V11.3333M9.33333 7.33333V11.3333" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        {/* Create/Edit Role Dialog */}
        <Modal open={showForm} onOpenChange={setShowForm}>
          <div className="p-6 max-w-[500px]">
            <h2 className="text-xl font-semibold mb-4">
              {editingRole ? 'Edit Role' : 'Create Role'}
            </h2>
            <hr className="border-gray-200 my-3" />
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Role Name</label>
                <select
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">Select role name</option>
                  <option value="admin">Admin</option>
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="accountant">Accountant</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Enter display name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Level</label>
                <input
                  type="number"
                  value={formData.level.toString()}
                  onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) || 0 })}
                  placeholder="Enter level"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm cursor-pointer">Active</label>
              </div>
            </div>

            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                {editingRole ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>

        {/* Permissions Dialog */}
        <Modal open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
          <div className="p-6 max-w-[800px] max-h-[80vh] overflow-auto">
            <h2 className="text-xl font-semibold mb-4">
              Manage Permissions - {selectedRole?.displayName}
            </h2>
            <hr className="border-gray-200 my-3" />
            
            <div>
              <p className="text-sm text-gray-500 mb-4">
                Select permissions for this role. Permissions can be resource-specific or use wildcards (*).
              </p>

              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Resource</th>
                        {ACTIONS.map(action => (
                          <th key={action} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                            {action}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {RESOURCES.map(resource => (
                        <tr key={resource} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-medium text-sm">{resource}</span>
                          </td>
                          {ACTIONS.map(action => (
                            <td key={action} className="px-4 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => togglePermission(resource, action)}
                                className={`px-2 py-1 rounded text-xs transition-colors ${
                                  hasPermission(resource, action)
                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {hasPermission(resource, action) ? (
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => setShowPermissionsDialog(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePermissions}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </Modal>

        {/* Delete Confirmation Dialog */}
        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title="Delete Role"
          description="Are you sure you want to delete this role? This action cannot be undone. Users with this role will need to be reassigned."
        >
          <button
            onClick={() => setDeleteDialogOpen(false)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
          >
            Delete
          </button>
        </AlertDialog>
        </div>
      </div>
    </section>
  );
}

