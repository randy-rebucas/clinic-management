'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await fetch('/api/setup');
      const data = await response.json();
      
      if (data.setupComplete) {
        setSetupComplete(true);
      } else {
        // Setup is not complete - show setup form
        setSetupComplete(false);
      }
    } catch (err: any) {
      // On error (including network errors, database connection issues), assume setup is needed
      console.error('Error checking setup status:', err);
      setSetupComplete(false);
    } finally {
      setLoading(false);
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
        setSuccess('Setup completed successfully! Redirecting to login...');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
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
    <div className="max-w-7xl mx-auto px-4">
      <div className="flex justify-center items-center" style={{ minHeight: '100vh', padding: '2rem 0' }}>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-2xl w-full">
          <div className="p-6">
            <h1 className="text-3xl font-bold mb-2">System Setup</h1>
            <p className="text-sm text-gray-600 mb-6">
              Welcome! Let's set up your clinic management system. This will create default roles, permissions, and an admin account.
            </p>

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

            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
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

                <h2 className="text-lg font-semibold">Admin Account</h2>
                <p className="text-sm text-gray-600 mb-2">
                  Create the initial administrator account
                </p>

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
                    <div className="mt-2">
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

                <hr className="border-gray-200" />

                <div>
                  <p className="text-sm text-gray-600">
                    <strong>What will be created:</strong>
                  </p>
                  <ul className="mt-2 pl-6 list-disc text-sm text-gray-600 space-y-1">
                    <li>5 default roles (Admin, Doctor, Nurse, Receptionist, Accountant)</li>
                    <li>Permission documents for each role (stored in database)</li>
                    <li>Admin user account</li>
                    <li>Default system settings (appointments, billing, queue, etc.)</li>
                    <li>Business hours configuration</li>
                  </ul>
                </div>

                <button 
                  type="submit" 
                  disabled={submitting || passwordErrors.length > 0}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
        </div>
      </div>
    </div>
  );
}

