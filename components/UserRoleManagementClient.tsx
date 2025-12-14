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
      const response = await fetch('/api/users');
      
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
      <section className="py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-indigo-50/30 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center gap-4 min-h-[50vh] justify-center">
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-100 border-t-indigo-600"></div>
            </div>
            <p className="text-gray-600 font-medium">Loading users...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-indigo-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-red-800 text-sm font-semibold">{error}</p>
              </div>
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-green-500 rounded-lg flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-green-800 text-sm font-semibold">{success}</p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">User Role Management</h1>
                <p className="text-sm sm:text-base text-gray-600 mt-1">Assign and manage roles for system users</p>
              </div>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {users.length === 0 ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                  <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No users found</h3>
                <p className="text-sm text-gray-600 font-medium">No users are available to manage.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Current Role</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="font-bold text-sm text-gray-900">{user.name}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {getRoleName(user)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full border ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : 'bg-red-100 text-red-800 border-red-200'
                          }`}>
                            {user.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            onClick={() => handleEditRole(user)}
                            className="px-4 py-2 text-xs bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 transition-all flex items-center gap-2 font-semibold shadow-sm"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-indigo-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Change User Role</h2>
            </div>
            <hr className="border-gray-200 my-4" />
            
            {editingUser && (
              <div className="flex flex-col gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase">User</label>
                  <p className="text-sm font-bold text-gray-900">{editingUser.name}</p>
                  <p className="text-xs text-gray-600">{editingUser.email}</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Select Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
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

            <div className="flex gap-3 mt-6 pt-4 border-t border-gray-200 justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={!selectedRoleId}
                className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-lg hover:from-indigo-600 hover:to-indigo-700 disabled:from-indigo-400 disabled:to-indigo-500 disabled:cursor-not-allowed transition-all text-sm font-semibold shadow-md"
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

