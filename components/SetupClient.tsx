'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SystemChecks {
  environment: {
    mongodbUri: boolean;
    sessionSecret: boolean;
    sessionSecretValid: boolean;
    mongodbUriValid: boolean;
    valid?: boolean;
    errors?: string[];
  };
  database: {
    connected: boolean;
    error: string | null;
  };
  optional: {
    sms: boolean;
    email: boolean;
    cloudinary: boolean;
  };
}

export default function SetupClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [systemChecks, setSystemChecks] = useState<SystemChecks | null>(null);
  const [canProceed, setCanProceed] = useState(false);
  const [checkingSystem, setCheckingSystem] = useState(false);
  const [seedingData, setSeedingData] = useState(false);
  const [seedData, setSeedData] = useState(false);

  const [formData, setFormData] = useState({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    confirmPassword: '',
    clinicName: '',
  });

  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  useEffect(() => {
    checkSetupStatus();
    checkSystemStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/api/setup');
      const data = await response.json();
      
      if (data.setupComplete) {
        setSetupComplete(true);
      } else {
        setSetupComplete(false);
      }
    } catch (err: any) {
      console.error('Error checking setup status:', err);
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const checkSystemStatus = async () => {
    setCheckingSystem(true);
    try {
      const response = await fetch('/api/setup/check');
      const data = await response.json();
      
      if (data.success) {
        setSystemChecks(data.checks);
        setCanProceed(data.canProceed);
      }
    } catch (err: any) {
      console.error('Error checking system status:', err);
    } finally {
      setCheckingSystem(false);
    }
  };

  const handleSeedData = async () => {
    setSeedingData(true);
    try {
      const response = await fetch('/api/setup/seed', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        // Show instructions for running seed command
        setSuccess(`To seed the database, run this command in your terminal: ${data.command}`);
        setSeedData(true);
      } else {
        setError(data.error || 'Failed to seed data');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to seed data');
    } finally {
      setSeedingData(false);
    }
  };

  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-zA-Z]/.test(password)) {
      errors.push('Password must contain at least one letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return errors;
  };

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, adminPassword: password });
    const errors = validatePassword(password);
    setPasswordErrors(errors);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate form
    if (!formData.adminName || !formData.adminEmail || !formData.adminPassword) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.adminPassword !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (passwordErrors.length > 0) {
      setError('Please fix password errors');
      return;
    }

    // Validate email
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(formData.adminEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminName: formData.adminName,
          adminEmail: formData.adminEmail,
          adminPassword: formData.adminPassword,
          clinicName: formData.clinicName || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Setup completed successfully!');
        setCurrentStep(3);
      } else {
        setError(data.error || 'Failed to complete setup');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-center items-center" style={{ minHeight: '100vh' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (setupComplete) {
    return (
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-center items-center" style={{ minHeight: '100vh' }}>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-md w-full">
            <div className="p-6">
              <div className="flex flex-col items-center gap-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <h2 className="text-xl font-semibold">Setup Already Complete</h2>
                <p className="text-sm text-gray-600 text-center">
                  The system has already been set up. Please log in to continue.
                </p>
                <button 
                  onClick={() => router.push('/login')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
            <h1 className="text-3xl font-bold mb-2">System Setup</h1>
            <p className="text-blue-100">
              Welcome! Let's set up your clinic management system step by step.
            </p>
          </div>

          {/* Progress Steps */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                        currentStep >= step
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {currentStep > step ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step
                      )}
                    </div>
                    <p className="text-xs mt-2 text-center text-gray-600">
                      {step === 1 ? 'System Check' : step === 2 ? 'Admin Account' : 'Complete'}
                    </p>
                  </div>
                  {step < 3 && (
                    <div
                      className={`h-1 flex-1 mx-2 ${
                        currentStep > step ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Step 1: System Checks */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-4">Step 1: System Prerequisites</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Let's verify that your system is ready for setup.
                  </p>
                </div>

                {checkingSystem && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                )}

                {systemChecks && (
                  <div className="space-y-4">
                    {/* Environment Variables */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Environment Variables
                      </h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">MongoDB URI</span>
                          {systemChecks.environment.mongodbUri && systemChecks.environment.mongodbUriValid ? (
                            <span className="text-green-600 text-sm flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Valid
                            </span>
                          ) : (
                            <span className="text-red-600 text-sm flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              {!systemChecks.environment.mongodbUri ? 'Missing' : 'Invalid'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Session Secret</span>
                          {systemChecks.environment.sessionSecret && systemChecks.environment.sessionSecretValid ? (
                            <span className="text-green-600 text-sm flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Valid
                            </span>
                          ) : (
                            <span className="text-red-600 text-sm flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              {!systemChecks.environment.sessionSecret ? 'Missing' : 'Too short'}
                            </span>
                          )}
                        </div>
                        {systemChecks.environment.errors && systemChecks.environment.errors.length > 0 && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                            {systemChecks.environment.errors.map((err, idx) => (
                              <div key={idx}>• {err}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Database Connection */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                        </svg>
                        Database Connection
                      </h3>
                      {systemChecks.database.connected ? (
                        <div className="text-green-600 text-sm flex items-center gap-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Connected successfully
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-red-600 text-sm flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Connection failed
                          </div>
                          {systemChecks.database.error && (
                            <p className="text-xs text-red-600 ml-5">{systemChecks.database.error}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Optional Services */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold mb-3">Optional Services</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span>SMS (Twilio)</span>
                          <span className={systemChecks.optional.sms ? 'text-green-600' : 'text-gray-400'}>
                            {systemChecks.optional.sms ? 'Configured' : 'Not configured'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Email (SMTP)</span>
                          <span className={systemChecks.optional.email ? 'text-green-600' : 'text-gray-400'}>
                            {systemChecks.optional.email ? 'Configured' : 'Not configured'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Cloudinary</span>
                          <span className={systemChecks.optional.cloudinary ? 'text-green-600' : 'text-gray-400'}>
                            {systemChecks.optional.cloudinary ? 'Configured' : 'Not configured'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!canProceed && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm text-yellow-800">
                          <strong>⚠️ Action Required:</strong> Please fix the issues above before proceeding. 
                          Make sure your <code className="bg-yellow-100 px-1 rounded">.env.local</code> file is properly configured.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={checkSystemStatus}
                        disabled={checkingSystem}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        {checkingSystem ? 'Checking...' : 'Re-check'}
                      </button>
                      <button
                        onClick={() => setCurrentStep(2)}
                        disabled={!canProceed}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex-1"
                      >
                        Continue to Setup
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Admin Account Setup */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold mb-4">Step 2: Create Admin Account</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Create the initial administrator account for your clinic management system.
                  </p>
                </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Clinic Name <span className="text-gray-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={formData.clinicName}
                      onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                      placeholder="Enter clinic name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <hr className="border-gray-200" />

                  <h3 className="text-lg font-semibold">Admin Account</h3>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Admin Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.adminName}
                      onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                      placeholder="Enter admin name"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Admin Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={formData.adminEmail}
                      onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                      placeholder="Enter admin email"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Admin Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={formData.adminPassword}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      placeholder="Enter password"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {passwordErrors.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {passwordErrors.map((err, idx) => (
                          <p key={idx} className="text-xs text-red-600 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            {err}
                          </p>
                        ))}
                      </div>
                    )}
                    {formData.adminPassword && passwordErrors.length === 0 && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Password meets requirements
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Confirm password"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {formData.confirmPassword && formData.adminPassword !== formData.confirmPassword && (
                      <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Passwords do not match
                      </p>
                    )}
                    {formData.confirmPassword && formData.adminPassword === formData.confirmPassword && (
                      <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Passwords match
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-semibold mb-2">What will be created:</p>
                    <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                      <li>5 default roles (Admin, Doctor, Nurse, Receptionist, Accountant)</li>
                      <li>Permission documents for each role</li>
                      <li>Admin user account</li>
                      <li>Default system settings</li>
                      <li>Business hours configuration</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(1)}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || passwordErrors.length > 0}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Setting up system...
                        </>
                      ) : (
                        'Complete Setup'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Step 3: Success & Optional Seed Data */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-semibold mb-2">Setup Complete!</h2>
                  <p className="text-gray-600">
                    Your clinic management system is ready to use.
                  </p>
                </div>

                {!seedData && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Optional: Seed Sample Data</h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Would you like to populate the database with sample data? This includes sample patients, 
                      doctors, appointments, and more. This is useful for testing and demonstration purposes.
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      <strong>Note:</strong> You'll need to run the seed command from your terminal.
                    </p>
                    <button
                      onClick={handleSeedData}
                      disabled={seedingData}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {seedingData ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Getting instructions...
                        </>
                      ) : (
                        'Get Seed Instructions'
                      )}
                    </button>
                  </div>
                )}

                {seedData && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800 font-semibold mb-2">
                      📋 Seed Data Instructions:
                    </p>
                    <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm mb-2">
                      npm run seed
                    </div>
                    <p className="text-xs text-blue-700">
                      Run this command in your terminal to populate the database with sample data.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => router.push('/login')}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Go to Login
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

