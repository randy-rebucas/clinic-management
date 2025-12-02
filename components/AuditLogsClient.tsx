'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface AuditLog {
  _id: string;
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  resource: string;
  resourceId?: string;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  changes?: Array<{ field: string; oldValue?: any; newValue?: any }>;
  success: boolean;
  errorMessage?: string;
  isSensitive?: boolean;
  timestamp: string;
  createdAt: string;
}

interface AuditLogsClientProps {
  user: { role: string; [key: string]: any };
}

const ACTIONS = [
  'create', 'read', 'update', 'delete', 'login', 'logout', 
  'export', 'print', 'download', 'view', 'access_denied',
  'password_change', 'permission_change', 'backup', 'restore',
  'data_export', 'data_deletion'
];

const RESOURCES = [
  'patient', 'visit', 'appointment', 'prescription', 'lab_result',
  'invoice', 'document', 'user', 'doctor', 'room', 'service',
  'notification', 'system'
];

export default function AuditLogsClient({ user }: AuditLogsClientProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [filters, setFilters] = useState({
    action: '',
    resource: '',
    userId: '',
    startDate: '',
    endDate: '',
    success: '',
    isSensitive: '',
  });
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', pagination.page.toString());
      params.set('limit', pagination.limit.toString());
      
      if (filters.action) params.set('action', filters.action);
      if (filters.resource) params.set('resource', filters.resource);
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.success) params.set('success', filters.success);
      if (filters.isSensitive) params.set('isSensitive', filters.isSensitive);

      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        // API returns { success: true, data: logs[], pagination: {...} }
        const logsArray = Array.isArray(data) ? data : (data.data || data.logs || []);
        setLogs(logsArray);
        if (data.pagination) {
          setPagination(prev => ({ 
            ...prev, 
            total: data.pagination.total || 0,
            pages: data.pagination.totalPages || data.pagination.pages || 1,
            page: data.pagination.page || 1,
            limit: data.pagination.limit || 50,
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionBadge = (action: string, success: boolean) => {
    const baseColors = success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
    const actionColors: Record<string, string> = {
      create: 'bg-blue-100 text-blue-800',
      read: 'bg-gray-100 text-gray-800',
      update: 'bg-yellow-100 text-yellow-800',
      delete: 'bg-red-100 text-red-800',
      login: 'bg-green-100 text-green-800',
      logout: 'bg-gray-100 text-gray-800',
      access_denied: 'bg-red-100 text-red-800',
    };
    const colors = success ? (actionColors[action] || baseColors) : 'bg-red-100 text-red-800';
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors}`}>
        {action.replace('_', ' ')}
      </span>
    );
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      resource: '',
      userId: '',
      startDate: '',
      endDate: '',
      success: '',
      isSensitive: '',
    });
  };

  return (
    <section className="py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
            <div>
              <h1 className="text-3xl font-bold mb-1">Audit Logs</h1>
              <p className="text-sm text-gray-500">View system activity and security logs</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <select
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="">All Actions</option>
                {ACTIONS.map(action => (
                  <option key={action} value={action}>{action.replace('_', ' ')}</option>
                ))}
              </select>

              <select
                value={filters.resource}
                onChange={(e) => handleFilterChange('resource', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="">All Resources</option>
                {RESOURCES.map(resource => (
                  <option key={resource} value={resource}>{resource.replace('_', ' ')}</option>
                ))}
              </select>

              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                placeholder="Start Date"
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />

              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                placeholder="End Date"
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              />

              <select
                value={filters.success}
                onChange={(e) => handleFilterChange('success', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="">All Results</option>
                <option value="true">Success</option>
                <option value="false">Failed</option>
              </select>

              <select
                value={filters.isSensitive}
                onChange={(e) => handleFilterChange('isSensitive', e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              >
                <option value="">All Sensitivity</option>
                <option value="true">Sensitive Only</option>
                <option value="false">Non-Sensitive</option>
              </select>

              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading audit logs...</p>
              </div>
            ) : !Array.isArray(logs) || logs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No audit logs found
              </div>
            ) : (
              <>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resource</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IP</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(Array.isArray(logs) ? logs : []).map((log) => (
                      <React.Fragment key={log._id}>
                        <tr className={`hover:bg-gray-50 ${!log.success ? 'bg-red-50' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(log.timestamp || log.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{log.userEmail || '-'}</div>
                            <div className="text-xs text-gray-500">{log.userRole || '-'}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getActionBadge(log.action, log.success)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-gray-900">{log.resource}</span>
                            {log.resourceId && (
                              <div className="text-xs text-gray-500 font-mono truncate max-w-[120px]" title={log.resourceId}>
                                {log.resourceId}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 truncate max-w-xs" title={log.description}>
                              {log.description || '-'}
                            </div>
                            {log.isSensitive && (
                              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                                Sensitive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">
                            {log.ipAddress || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => setExpandedLog(expandedLog === log._id ? null : log._id)}
                              className="text-blue-600 hover:text-blue-900 text-sm"
                            >
                              {expandedLog === log._id ? 'Hide' : 'View'}
                            </button>
                          </td>
                        </tr>
                        {expandedLog === log._id && (
                          <tr>
                            <td colSpan={7} className="px-4 py-4 bg-gray-50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <div className="text-gray-500 text-xs uppercase">Request Method</div>
                                  <div className="font-mono">{log.requestMethod || '-'}</div>
                                </div>
                                <div>
                                  <div className="text-gray-500 text-xs uppercase">Request Path</div>
                                  <div className="font-mono truncate">{log.requestPath || '-'}</div>
                                </div>
                                <div className="col-span-2">
                                  <div className="text-gray-500 text-xs uppercase">User Agent</div>
                                  <div className="text-xs truncate">{log.userAgent || '-'}</div>
                                </div>
                                {log.errorMessage && (
                                  <div className="col-span-4">
                                    <div className="text-gray-500 text-xs uppercase">Error Message</div>
                                    <div className="text-red-600">{log.errorMessage}</div>
                                  </div>
                                )}
                                {log.changes && log.changes.length > 0 && (
                                  <div className="col-span-4">
                                    <div className="text-gray-500 text-xs uppercase mb-2">Changes</div>
                                    <div className="bg-white rounded border p-2 space-y-1">
                                      {log.changes.map((change, i) => (
                                        <div key={i} className="text-xs">
                                          <span className="font-medium">{change.field}:</span>
                                          <span className="text-red-500 line-through mx-1">
                                            {JSON.stringify(change.oldValue) || 'null'}
                                          </span>
                                          →
                                          <span className="text-green-600 mx-1">
                                            {JSON.stringify(change.newValue) || 'null'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="px-4 py-3 border-t flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                        disabled={pagination.page === 1}
                        className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1 text-sm">
                        Page {pagination.page} of {pagination.pages}
                      </span>
                      <button
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                        disabled={pagination.page === pagination.pages}
                        className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

