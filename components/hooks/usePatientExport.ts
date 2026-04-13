'use client';

import { useState, useCallback } from 'react';

interface ExportOptions {
  patientIds: string[];
  format: 'csv' | 'json';
  columns?: string[];
}

interface UsePatientExportResult {
  loading: boolean;
  error: string | null;
  success: boolean;
  exportPatients: (options: ExportOptions) => Promise<void>;
}

export function usePatientExport(): UsePatientExportResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const exportPatients = useCallback(async (options: ExportOptions) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(false);

      const response = await fetch('/api/patients/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientIds: options.patientIds,
          format: options.format,
          columns: options.columns,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(data.error || `Export failed with status ${response.status}`);
      }

      // Get filename from response header
      const disposition = response.headers.get('content-disposition');
      let filename = `patients-export-${new Date().toISOString().split('T')[0]}.${options.format}`;
      if (disposition) {
        const match = disposition.match(/filename="([^"]+)"/);
        if (match) filename = match[1];
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
      console.error('Export error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    success,
    exportPatients,
  };
}
