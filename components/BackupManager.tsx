'use client';

import { useState, useEffect, useCallback } from 'react';

interface BackupRecord {
  _id: string;
  label?: string;
  status: 'pending' | 'completed' | 'failed' | 'restoring';
  collections: string[];
  totalDocuments: number;
  sizeBytes: number;
  createdByEmail?: string;
  createdAt: string;
  restoredAt?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function BackupManager() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<BackupRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BackupRecord | null>(null);
  const [restoreResults, setRestoreResults] = useState<Record<string, { inserted: number; errors: number }> | null>(null);

  const fetchBackups = useCallback(async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/backups?page=${p}&limit=10`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch backups');
      setBackups(json.data);
      setPagination(json.pagination);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchBackups(page); }, [page]);

  async function createBackup() {
    setActionId('create');
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to create backup');
      setSuccess('Backup created successfully.');
      setLabel('');
      await fetchBackups(1);
      setPage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  }

  async function downloadBackup(backup: BackupRecord) {
    setActionId(backup._id + '-download');
    setError('');
    try {
      const res = await fetch(`/api/backups/${backup._id}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] || `backup-${backup._id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  }

  async function restoreBackup(backup: BackupRecord) {
    setConfirmRestore(null);
    setActionId(backup._id + '-restore');
    setError('');
    setSuccess('');
    setRestoreResults(null);
    try {
      const res = await fetch(`/api/backups/${backup._id}/restore`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Restore failed');
      setSuccess(json.message || 'Restore completed.');
      setRestoreResults(json.data);
      await fetchBackups(page);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  }

  async function deleteBackup(backup: BackupRecord) {
    setConfirmDelete(null);
    setActionId(backup._id + '-delete');
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/backups/${backup._id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Delete failed');
      setSuccess('Backup deleted.');
      await fetchBackups(page);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  }

  const statusBadge = (status: BackupRecord['status']) => {
    const map: Record<string, string> = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      restoring: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Create Backup */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Create Backup</h3>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. before-migration"
              maxLength={200}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={createBackup}
            disabled={actionId === 'create'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {actionId === 'create' ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating...
              </>
            ) : 'Create Backup'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {/* Restore Results */}
      {restoreResults && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Restore Results</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1.5 pr-4 font-medium text-gray-500">Collection</th>
                  <th className="text-right py-1.5 pr-4 font-medium text-gray-500">Inserted</th>
                  <th className="text-right py-1.5 font-medium text-gray-500">Errors</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(restoreResults).map(([col, r]) => (
                  <tr key={col} className="border-b border-gray-50">
                    <td className="py-1.5 pr-4 font-mono text-xs text-gray-700">{col}</td>
                    <td className="py-1.5 pr-4 text-right text-green-700">{r.inserted}</td>
                    <td className={`py-1.5 text-right ${r.errors > 0 ? 'text-red-700' : 'text-gray-400'}`}>{r.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setRestoreResults(null)} className="mt-3 text-xs text-gray-500 underline">Dismiss</button>
        </div>
      )}

      {/* Backup List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Backups {pagination ? `(${pagination.total})` : ''}
          </h3>
          <button
            onClick={() => fetchBackups(page)}
            disabled={loading}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-gray-400 text-sm">Loading...</div>
        ) : backups.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-sm">No backups found. Create one above.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {backups.map((b) => {
              const busy = actionId?.startsWith(b._id);
              return (
                <div key={b._id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {b.label || <span className="text-gray-400 italic">Untitled</span>}
                      </span>
                      {statusBadge(b.status)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span>{formatDate(b.createdAt)}</span>
                      <span>{b.totalDocuments.toLocaleString()} documents</span>
                      <span>{formatBytes(b.sizeBytes)}</span>
                      <span>{b.collections.length} collections</span>
                      {b.createdByEmail && <span>by {b.createdByEmail}</span>}
                      {b.restoredAt && <span>Restored: {formatDate(b.restoredAt)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => downloadBackup(b)}
                      disabled={!!busy}
                      title="Download JSON"
                      className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      {actionId === b._id + '-download' ? 'Downloading...' : 'Download'}
                    </button>
                    <button
                      onClick={() => setConfirmRestore(b)}
                      disabled={!!busy || b.status === 'restoring'}
                      title="Restore this backup"
                      className="px-3 py-1.5 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                    >
                      {actionId === b._id + '-restore' ? 'Restoring...' : 'Restore'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(b)}
                      disabled={!!busy}
                      title="Delete backup"
                      className="px-3 py-1.5 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      {actionId === b._id + '-delete' ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Restore Confirmation Modal */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Confirm Restore</h3>
            <p className="text-sm text-gray-600 mb-1">
              This will <strong>overwrite all current data</strong> with the backup from:
            </p>
            <p className="text-sm font-medium text-gray-800 mb-1">
              {confirmRestore.label || 'Untitled'} — {formatDate(confirmRestore.createdAt)}
            </p>
            <p className="text-xs text-red-600 mb-5">
              This action cannot be undone. Consider creating a backup of the current data first.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => restoreBackup(confirmRestore)}
                className="px-4 py-2 text-sm bg-amber-600 text-white rounded-md hover:bg-amber-700"
              >
                Yes, Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Backup</h3>
            <p className="text-sm text-gray-600 mb-4">
              Permanently delete the backup <strong>{confirmDelete.label || 'Untitled'}</strong> from{' '}
              {formatDate(confirmDelete.createdAt)}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteBackup(confirmDelete)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
