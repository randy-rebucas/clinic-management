'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface InstallCheck {
  nodeVersion?: string;
  nodeVersionValid: boolean;
  dependenciesInstalled: boolean;
  envLocalExists?: boolean;
  environmentConfigured: boolean;
  databaseConnected: boolean;
  databaseReset: boolean;
  errors: string[];
  warnings: string[];
}

interface InstallClientProps {
  initialChecks: InstallCheck;
}

export default function InstallClient({ initialChecks }: InstallClientProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [installing, setInstalling] = useState(false);
  const [checks] = useState<InstallCheck>(initialChecks);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    // Auto-advance to next step if current step is complete
    if (currentStep === 1 && checks.nodeVersionValid && checks.dependenciesInstalled) {
      setCurrentStep(2);
    } else if (currentStep === 2 && checks.environmentConfigured && checks.databaseConnected) {
      setCurrentStep(3);
    } else if (currentStep === 3 && checks.databaseReset) {
      setCurrentStep(4);
    }
  }, [checks, currentStep]);

  const refreshPage = () => {
    router.refresh();
  };

  const handleInstallDependencies = async () => {
    setInstalling(true);
    try {
      const response = await fetch('/api/install/dependencies', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Please run "npm install" in your terminal, then refresh this page.');
      } else {
        alert(data.error || 'Please run "npm install" in your terminal.');
      }
    } catch (err: any) {
      alert('Please run "npm install" in your terminal.');
    } finally {
      setInstalling(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!resetConfirm) {
      alert('Please confirm that you want to reset the database. This will delete all data!');
      return;
    }

    setResetting(true);
    try {
      const response = await fetch('/api/install/reset', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        alert('Database reset successfully! Refreshing page...');
        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        alert(data.error || 'Failed to reset database');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reset database');
    } finally {
      setResetting(false);
      setResetConfirm(false);
    }
  };

  const steps = [
    { number: 1, title: 'Prerequisites', description: 'Check system requirements' },
    { number: 2, title: 'Environment', description: 'Configure environment variables' },
    { number: 3, title: 'Database', description: 'Reset & test connection' },
    { number: 4, title: 'Complete', description: 'Installation finished' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl shadow-xl mb-6">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Installation Wizard</h1>
          <p className="text-gray-600 text-lg">
            Welcome to MyClinicSoft installation
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          {/* Progress Steps */}
          <div className="bg-gray-50 border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold transition-all ${
                        currentStep >= step.number
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {currentStep > step.number ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        step.number
                      )}
                    </div>
                    <p className="text-xs mt-2 text-center text-gray-600 font-medium">
                      {step.title}
                    </p>
                    <p className="text-xs text-gray-400 text-center mt-1">
                      {step.description}
                    </p>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`h-1 flex-1 mx-2 transition-all ${
                        currentStep > step.number ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="p-8">
            <>
                {/* Step 1: Prerequisites */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Step 1: System Prerequisites</h2>
                      <p className="text-gray-600">
                        Let's verify that your system meets the requirements.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Node.js Version */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold">Node.js Version</span>
                          </div>
                          {checks.nodeVersionValid ? (
                            <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {checks.nodeVersion || 'Valid'}
                            </span>
                          ) : (
                            <span className="text-red-600 text-sm font-medium">Not Detected</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 ml-9">
                          Requires Node.js 20.9 or higher
                        </p>
                      </div>

                      {/* Dependencies */}
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            <span className="font-semibold">Dependencies</span>
                          </div>
                          {checks.dependenciesInstalled ? (
                            <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Installed
                            </span>
                          ) : (
                            <span className="text-yellow-600 text-sm font-medium">Not Installed</span>
                          )}
                        </div>
                        {!checks.dependenciesInstalled && (
                          <div className="ml-9 mt-2">
                            <button
                              onClick={handleInstallDependencies}
                              disabled={installing}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                            >
                              {installing ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  Installing...
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                  </svg>
                                  Install Dependencies
                                </>
                              )}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                              Or run manually: <code className="bg-gray-100 px-1 rounded">npm install</code>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {checks.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h3 className="font-semibold text-red-800 mb-2">Errors:</h3>
                        <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                          {checks.errors.map((error, idx) => (
                            <li key={idx}>{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {checks.warnings.length > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h3 className="font-semibold text-yellow-800 mb-2">Warnings:</h3>
                        <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                          {checks.warnings.map((warning, idx) => (
                            <li key={idx}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={refreshPage}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => setCurrentStep(2)}
                        disabled={!checks.nodeVersionValid || !checks.dependenciesInstalled}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Environment Configuration */}
                {currentStep === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Step 2: Environment Configuration</h2>
                      <p className="text-gray-600">
                        Configure your environment variables in <code className="bg-gray-100 px-1 rounded">.env.local</code>
                      </p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h3 className="font-semibold text-blue-900 mb-3">Required Environment Variables</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-blue-800">MONGODB_URI</label>
                          <p className="text-xs text-blue-700 mt-1">
                            Your MongoDB connection string (e.g., <code>mongodb://localhost:27017/myclinicsoft</code> or MongoDB Atlas connection string)
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-blue-800">SESSION_SECRET</label>
                          <p className="text-xs text-blue-700 mt-1">
                            A secure random string (minimum 32 characters). Generate with: <code>openssl rand -base64 32</code>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Environment Variables</span>
                        {checks.environmentConfigured ? (
                          <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Configured
                          </span>
                        ) : (
                          <span className="text-yellow-600 text-sm font-medium">Not Configured</span>
                        )}
                      </div>
                      {!checks.environmentConfigured && (
                        <div className="mt-2">
                          {checks.envLocalExists ? (
                            <div className="space-y-2">
                              <p className="text-sm text-gray-600">
                                <code className="bg-gray-100 px-1 rounded">.env.local</code> file exists but needs to be updated.
                              </p>
                              <p className="text-xs text-gray-500">
                                Please ensure the file contains valid <code className="bg-gray-100 px-1 rounded">MONGODB_URI</code> and <code className="bg-gray-100 px-1 rounded">SESSION_SECRET</code> values.
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600">
                              Please create a <code className="bg-gray-100 px-1 rounded">.env.local</code> file in the project root with the required variables.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setCurrentStep(1)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={refreshPage}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => setCurrentStep(3)}
                        disabled={!checks.environmentConfigured}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Database Reset & Connection */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-semibold mb-2">Step 3: Database Reset & Connection</h2>
                      <p className="text-gray-600">
                        Reset the database to ensure a clean installation, then test the connection.
                      </p>
                    </div>

                    {/* Database Reset */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Database Reset</span>
                        {checks.databaseReset ? (
                          <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Reset Complete
                          </span>
                        ) : (
                          <span className="text-yellow-600 text-sm font-medium">Not Reset</span>
                        )}
                      </div>
                      {!checks.databaseReset && (
                        <div className="mt-3 space-y-3">
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <p className="text-sm text-red-800 font-semibold mb-2">⚠️ Warning</p>
                            <p className="text-sm text-red-700">
                              This will delete <strong>ALL</strong> data from the database including:
                            </p>
                            <ul className="text-xs text-red-600 mt-2 list-disc list-inside space-y-1">
                              <li>All patients, appointments, and medical records</li>
                              <li>All users, roles, and permissions</li>
                              <li>All invoices, documents, and settings</li>
                              <li>Everything else in the database</li>
                            </ul>
                            <p className="text-xs text-red-700 mt-2 font-semibold">
                              This action cannot be undone!
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="resetConfirm"
                              checked={resetConfirm}
                              onChange={(e) => setResetConfirm(e.target.checked)}
                              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            />
                            <label htmlFor="resetConfirm" className="text-sm text-gray-700">
                              I understand this will delete all data and want to proceed
                            </label>
                          </div>
                          {!checks.databaseConnected && (
                            <p className="text-xs text-gray-500 mt-2">
                              ⚠️ Please test the database connection first before resetting.
                            </p>
                          )}
                          <button
                            onClick={handleResetDatabase}
                            disabled={!resetConfirm || resetting || !checks.databaseConnected}
                            className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {resetting ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Resetting Database...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Reset Database
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Database Connection */}
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">Database Connection</span>
                        {checks.databaseConnected ? (
                          <span className="text-green-600 text-sm font-medium flex items-center gap-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Connected
                          </span>
                        ) : (
                          <span className="text-red-600 text-sm font-medium flex items-center gap-1">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Failed
                          </span>
                        )}
                      </div>
                      {!checks.databaseConnected && (
                        <p className="text-sm text-gray-600 mt-2">
                          Please check your MONGODB_URI in <code className="bg-gray-100 px-1 rounded">.env.local</code> and ensure MongoDB is running.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={refreshPage}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => setCurrentStep(4)}
                        disabled={!checks.databaseConnected || !checks.databaseReset}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Complete Installation
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 4: Complete */}
                {currentStep === 4 && (
                  <div className="space-y-6 text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
                      <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-semibold mb-2">Installation Complete!</h2>
                    <p className="text-gray-600 mb-6">
                      MyClinicSoft has been successfully installed and configured.
                    </p>
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => router.push('/login')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                      >
                        Go to Login
                      </button>
                    </div>
                  </div>
                )}
            </>
          </div>
        </div>
      </div>
    </div>
  );
}

