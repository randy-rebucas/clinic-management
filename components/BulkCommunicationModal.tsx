'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Loader, Mail, MessageSquare, X } from 'lucide-react';
import { ApiError } from '@/lib/errors';

interface BulkCommunicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPatients: string[];
}

interface BulkCommunicationRequest {
  type: 'sms' | 'email';
  recipientIds: string[];
  template: string;
  variables: Record<string, string>;
  testMode: boolean;
}

interface BulkCommunicationResponse {
  success: boolean;
  data: {
    totalRecipients: number;
    results: {
      sent: number;
      failed: number;
      queued: number;
    };
    testMode: boolean;
    logs: Array<{
      patientId: string;
      status: 'sent' | 'failed' | 'queued';
      message?: string;
    }>;
  };
}

// Pre-defined templates with variable hints
const TEMPLATES = {
  appointmentReminder: {
    sms: 'Hi {{firstName}}, reminder: You have an appointment on {{appointmentDate}} at {{appointmentTime}}. Reply CANCEL to reschedule.',
    email: 'Hi {{firstName}},\n\nThis is a reminder of your upcoming appointment:\nDate: {{appointmentDate}}\nTime: {{appointmentTime}}\n\nPlease arrive 10 minutes early.',
  },
  paymentReminder: {
    sms: 'Hi {{firstName}}, this is a payment reminder. Outstanding balance: ₱{{amount}}. Please settle at your earliest convenience.',
    email: 'Hi {{firstName}},\n\nYou have an outstanding balance of ₱{{amount}}. Please visit our office or call to make a payment.',
  },
  prescriptionReady: {
    sms: 'Hi {{firstName}}, your prescription is ready for pickup. Please visit our clinic or call for delivery details.',
    email: 'Hi {{firstName}},\n\nYour prescription is ready! You can pick it up at our clinic or request delivery.',
  },
};

const AVAILABLE_VARIABLES: Record<string, string> = {
  firstName: 'Patient first name',
  lastName: 'Patient last name',
  fullName: 'Patient full name',
  appointmentDate: 'Appointment date',
  appointmentTime: 'Appointment time',
  amount: 'Amount owed',
  dueDate: 'Due date',
  medicationName: 'Medication name',
  doctorName: 'Doctor name',
  clinicName: 'Clinic name',
};

export function BulkCommunicationModal({
  isOpen,
  onClose,
  selectedPatients,
}: BulkCommunicationModalProps) {
  const [communicationType, setCommunicationType] = useState<'sms' | 'email'>('sms');
  const [template, setTemplate] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [testMode, setTestMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [result, setResult] = useState<BulkCommunicationResponse['data'] | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleTemplateSelect = useCallback((name: string) => {
    setSelectedTemplate(name);
    const templateText = TEMPLATES[name as keyof typeof TEMPLATES]?.[communicationType];
    if (templateText) {
      setTemplate(templateText);
    }
    setError('');
  }, [communicationType]);

  const handleVariableChange = useCallback((key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  }, []);

  const getPreviewText = useCallback(() => {
    let preview = template;
    Object.entries(variables).forEach(([key, value]) => {
      if (value) {
        preview = preview.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    });
    return preview;
  }, [template, variables]);

  const handleSend = async () => {
    setError('');
    setSuccess(false);

    // Validation
    if (!template.trim()) {
      setError('Please enter a message template.');
      return;
    }

    if (selectedPatients.length === 0) {
      setError('No patients selected.');
      return;
    }

    // Check if template has variables that aren't filled
    const templateVars = template.match(/{{(\w+)}}/g) || [];
    const unfilled = templateVars.filter(
      (v) => !variables[v.replace(/[{}]/g, '')] || variables[v.replace(/[{}]/g, '')].trim() === ''
    );

    if (unfilled.length > 0) {
      setError(`Please fill all variables: ${unfilled.join(', ')}`);
      return;
    }

    setIsLoading(true);

    try {
      const payload: BulkCommunicationRequest = {
        type: communicationType,
        recipientIds: selectedPatients,
        template,
        variables,
        testMode,
      };

      const response = await fetch('/api/communications/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new ApiError(
          response.status,
          errorData.error || 'Failed to send communications'
        );
      }

      const data: BulkCommunicationResponse = await response.json();
      if (data.success) {
        setSuccess(true);
        setResult(data.data);
        // Reset form after 2 seconds
        setTimeout(() => {
          handleReset();
        }, 2000);
      } else {
        setError('Failed to send communications.');
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'An error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setTemplate('');
    setSelectedTemplate('');
    setVariables({});
    setTestMode(false);
    setError('');
    setSuccess(false);
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" role="dialog" aria-labelledby="modal-title">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-3">
            {communicationType === 'sms' ? (
              <MessageSquare className="text-blue-600" size={24} />
            ) : (
              <Mail className="text-blue-600" size={24} />
            )}
            <h2 id="modal-title" className="text-xl font-semibold">
              Bulk {communicationType === 'sms' ? 'SMS' : 'Email'} Campaign
            </h2>
          </div>
          <button
            onClick={handleReset}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        {/* Success State */}
        {success && result && (
          <div className="p-6 bg-green-50 border-b">
            <div className="flex items-start gap-3 mb-4">
              <div className="text-green-600 mt-1">✓</div>
              <div>
                <h3 className="font-semibold text-green-900">Communications sent successfully!</h3>
                <p className="text-sm text-green-800 mt-1">
                  Sent: {result.results.sent} | Failed: {result.results.failed} | Queued:{' '}
                  {result.results.queued}
                </p>
                {result.testMode && (
                  <p className="text-xs text-green-700 mt-2 italic">
                    (This was a test send - no actual messages were transmitted)
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 bg-red-50 border-b flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-red-800 flex-1">{error}</div>
            <button
              onClick={() => setError('')}
              className="text-red-600 hover:text-red-700"
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Communication Type Selection */}
          <div>
            <label className="block text-sm font-medium mb-3">Communication Type</label>
            <div className="flex gap-3">
              {(['sms', 'email'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setCommunicationType(type);
                    setTemplate('');
                    setSelectedTemplate('');
                    setError('');
                  }}
                  className={`flex-1 p-3 border-2 rounded-lg transition-all ${
                    communicationType === type
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  aria-pressed={communicationType === type}
                >
                  {type === 'sms' ? (
                    <>
                      <MessageSquare className="inline mr-2" size={18} />
                      SMS
                    </>
                  ) : (
                    <>
                      <Mail className="inline mr-2" size={18} />
                      Email
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Quick Templates</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.keys(TEMPLATES).map((name) => (
                <button
                  key={name}
                  onClick={() => handleTemplateSelect(name)}
                  className={`text-xs p-2 rounded border transition-all ${
                    selectedTemplate === name
                      ? 'bg-blue-100 border-blue-600'
                      : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                  aria-pressed={selectedTemplate === name}
                >
                  {name
                    .replace(/([A-Z])/g, ' $1')
                    .trim()
                    .split(' ')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Message Template */}
          <div>
            <label htmlFor="template" className="block text-sm font-medium mb-2">
              Message Template
            </label>
            <textarea
              id="template"
              ref={textAreaRef}
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                setSelectedTemplate('');
                setError('');
              }}
              placeholder={`Enter your message. Use {{variableName}} for variables.\nExample: Hi {{firstName}}, your appointment is {{appointmentDate}}`}
              className="w-full h-32 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              aria-label="Message template"
            />
            <p className="text-xs text-gray-500 mt-1">
              Use double curly braces for variables: {`{{variableName}}`}
            </p>
          </div>

          {/* Message Preview */}
          {template && getPreviewText() !== template && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs font-medium text-gray-600 mb-2">Preview:</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{getPreviewText()}</p>
            </div>
          )}

          {/* Variables */}
          <div>
            <label className="block text-sm font-medium mb-3">Variables</label>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(AVAILABLE_VARIABLES).map(([key, description]) => {
                // Only show if used in template
                if (!template.includes(`{{${key}}}`)) return null;
                return (
                  <div key={key}>
                    <label
                      htmlFor={`var-${key}`}
                      className="block text-xs font-medium text-gray-600 mb-1"
                    >
                      {key} <span className="text-gray-400">({description})</span>
                    </label>
                    <input
                      id={`var-${key}`}
                      type="text"
                      value={variables[key] || ''}
                      onChange={(e) => handleVariableChange(key, e.target.value)}
                      placeholder={`Enter ${key}`}
                      className="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      aria-label={description}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test Mode & Recipients */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={testMode}
                onChange={(e) => setTestMode(e.target.checked)}
                className="w-4 h-4 rounded cursor-pointer"
                aria-label="Test mode - no messages will be sent"
              />
              <span className="text-sm text-gray-700">
                Test Mode (no messages will be sent)
              </span>
            </label>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                <strong>Recipients:</strong> {selectedPatients.length} patient
                {selectedPatients.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={isLoading || selectedPatients.length === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              aria-label={testMode ? 'Send test' : 'Send messages'}
            >
              {isLoading && <Loader size={18} className="animate-spin" />}
              {isLoading
                ? 'Sending...'
                : testMode
                  ? 'Send Test'
                  : `Send to ${selectedPatients.length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
