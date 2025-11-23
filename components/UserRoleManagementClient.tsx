'use client';

import { useEffect, useState } from 'react';
import { Modal } from './ui/Modal';

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
      setError(null);
      const response = await fetch('/api/staff');
      
      if (!response.ok) {
        let errorMessage = 'Failed to fetch users';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        
        if (response.status === 401) {
          errorMessage = 'Unauthorized. Please log in.';
        } else if (response.status === 403) {
          errorMessage = 'Access denied. Admin privileges required.';
        }
        
        setError(errorMessage);
        setTimeout(() => setError(null), 5000);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error || 'Failed to fetch users');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users');
      setTimeout(() => setError(null), 5000);
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

      if (!response.ok) {
        let errorMessage = 'Failed to update user role';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = response.statusText || errorMessage;
        }
        setError(errorMessage);
        setTimeout(() => setError(null), 5000);
        return;
      }

      const data = await response.json();
      
      if (data.success) {
        setSuccess('User role updated successfully!');
        setEditingUser(null);
        fetchUsers();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update user role');
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
      setTimeout(() => setError(null), 5000);
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
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-3 min-h-[50vh] justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-500">Loading users...</p>
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
                <h1 className="text-3xl font-bold mb-1">User Role Management</h1>
                <p className="text-sm text-gray-500">Assign and manage roles for system users</p>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {users.length === 0 ? (
              <div className="p-12 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
                <p className="mt-1 text-sm text-gray-500">No users are available to manage.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Current Role</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-sm">{user.name}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{user.email}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {getRoleName(user)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => handleEditRole(user)}
                            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors flex items-center gap-1"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11.3333 1.99999C11.5084 1.82488 11.7163 1.68698 11.9444 1.59499C12.1726 1.503 12.4163 1.45898 12.6622 1.46599C12.9081 1.473 13.1511 1.53088 13.3752 1.63606C13.5993 1.74124 13.7998 1.89139 13.9648 2.07732C14.1298 2.26325 14.2557 2.4809 14.3353 2.71728C14.4149 2.95366 14.4464 3.20399 14.428 3.45332C14.4096 3.70265 14.3416 3.946 14.2277 4.16866C14.1138 4.39132 13.9564 4.58866 13.7647 4.74866L5.528 13L1.33333 14L2.33333 9.80533L10.57 1.57066L11.3333 1.99999Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Change Role
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        {/* Edit Role Dialog */}
        <Modal open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <div className="p-6 max-w-[400px]">
            <h2 className="text-xl font-semibold mb-4">Change User Role</h2>
            <hr className="border-gray-200 my-3" />
            
            {editingUser && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">User</label>
                  <p className="text-sm text-gray-700">{editingUser.name} ({editingUser.email})</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Select Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Select role</option>
                    {roles.map((role) => (
                      <option key={role._id} value={role._id}>
                        {role.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={!selectedRoleId}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </Modal>
        </div>
      </div>
    </section>
  );
}

