'use client';

import { useState, useMemo } from 'react';
import { usePatientExport } from './hooks/usePatientExport';

interface PatientExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientIds: string[];
  patientCount: number;
}

const DEFAULT_COLUMNS = [
  { value: 'patientCode', label: 'Patient Code' },
  { value: 'firstName', label: 'First Name' },
  { value: 'middleName', label: 'Middle Name' },
  { value: 'lastName', label: 'Last Name' },
  { value: 'dateOfBirth', label: 'Date of Birth' },
  { value: 'sex', label: 'Sex' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'address.street', label: 'Street Address' },
  { value: 'address.city', label: 'City' },
  { value: 'address.state', label: 'State' },
  { value: 'address.zipCode', label: 'Zip Code' },
  { value: 'philHealth', label: 'PhilHealth Number' },
  { value: 'nationalId', label: 'National ID' },
];

export default function PatientExportModal({
  open,
  onOpenChange,
  patientIds,
  patientCount,
}: PatientExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [selectedColumns, setSelectedColumns] = useState<string[]>(
    DEFAULT_COLUMNS.slice(0, 8).map((c) => c.value) // Default: first 8 columns
  );
  const { loading, error, exportPatients } = usePatientExport();

  const selectAllColumns = () => {
    setSelectedColumns(DEFAULT_COLUMNS.map((c) => c.value));
  };

  const clearColumns = () => {
    setSelectedColumns([]);
  };

  const toggleColumn = (value: string) => {
    setSelectedColumns((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      alert('Please select at least one column');
      return;
    }

    await exportPatients({
      patientIds,
      format,
      columns: format === 'csv' ? selectedColumns : undefined,
    });

    // Close modal on success
    setTimeout(() => {
      onOpenChange(false);
    }, 500);
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Export Patients</h2>
              <p className="text-sm text-gray-600 mt-1">
                Exporting <span className="font-semibold">{patientCount}</span> patient{patientCount !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Format Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Export Format</label>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'csv', label: 'CSV', description: 'Spreadsheet format (Excel, Sheets)' },
                  { value: 'json', label: 'JSON', description: 'Structured data format' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setFormat(option.value as 'csv' | 'json')}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      format === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{option.label}</div>
                    <div className="text-xs text-gray-600 mt-1">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Column Selection (CSV only) */}
            {format === 'csv' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-900">Columns to Include</label>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllColumns}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                    >
                      Select All
                    </button>
                    <button
                      onClick={clearColumns}
                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-medium"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-48 overflow-y-auto">
                  {DEFAULT_COLUMNS.map((col) => (
                    <label key={col.value} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col.value)}
                        onChange={() => toggleColumn(col.value)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">{col.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  {selectedColumns.length} column{selectedColumns.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">
                  <strong>Error:</strong> {error}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={loading || selectedColumns.length === 0}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm font-semibold shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? <svg className="animate-spin h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.172l-3.536 3.536" /></svg> : null}
              {loading ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
