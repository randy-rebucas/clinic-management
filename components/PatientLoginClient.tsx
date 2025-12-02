'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';

export default function PatientLoginClient() {
  const [loginMethod, setLoginMethod] = useState<'code' | 'qr'>('code');
  const [patientCode, setPatientCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCodeLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Find patient by code first
      const findRes = await fetch(`/api/patients?patientCode=${patientCode}`);
      const findData = await findRes.json();

      if (!findData.success || !findData.data || findData.data.length === 0) {
        setError('Patient code not found. Please check your code and try again.');
        setLoading(false);
        return;
      }

      const patient = findData.data[0];

      // Create QR code data for login
      const qrData = JSON.stringify({
        patientId: patient._id || patient.id,
        patientCode: patient.patientCode,
        type: 'patient_login',
        timestamp: Date.now(),
      });

      // Use QR login endpoint
      const loginRes = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode: qrData }),
      });

      const loginData = await loginRes.json();

      if (loginData.success) {
        // Redirect to patient portal
        router.push('/patient/portal');
      } else {
        setError(loginData.error || 'Login failed. Please try again.');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setError(`Login failed: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQRLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCode }),
      });

      const data = await res.json();

      if (data.success) {
        // Redirect to patient portal
        router.push('/patient/portal');
      } else {
        setError(data.error || 'Invalid QR code. Please try again.');
      }
    } catch (error: any) {
      console.error('QR login error:', error);
      setError(`Login failed: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Patient Portal Login</h1>
          <p className="text-gray-600">Access your medical records and appointments</p>
        </div>

        {/* Login Method Tabs */}
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden mb-4">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                setLoginMethod('code');
                setError(null);
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                loginMethod === 'code'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Patient Code
            </button>
            <button
              onClick={() => {
                setLoginMethod('qr');
                setError(null);
              }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                loginMethod === 'qr'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              QR Code
            </button>
          </div>

          <div className="p-6">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Patient Code Login */}
            {loginMethod === 'code' && (
              <form onSubmit={handleCodeLogin} className="space-y-4">
                <div>
                  <label htmlFor="patientCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Patient Code
                  </label>
                  <input
                    id="patientCode"
                    type="text"
                    value={patientCode}
                    onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                    placeholder="CLINIC-0001"
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the patient code you received during registration
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
            )}

            {/* QR Code Login */}
            {loginMethod === 'qr' && (
              <form onSubmit={handleQRLogin} className="space-y-4">
                <div>
                  <label htmlFor="qrCode" className="block text-sm font-medium text-gray-700 mb-2">
                    QR Code Data
                  </label>
                  <textarea
                    id="qrCode"
                    value={qrCode}
                    onChange={(e) => setQrCode(e.target.value)}
                    placeholder="Paste your QR code data here or scan with camera"
                    rows={4}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-mono text-sm"
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Paste the QR code data from your registration confirmation
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Logging in...' : 'Login with QR Code'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-600">
            Don't have a patient code?{' '}
            <Link href="/onboard" className="text-blue-600 hover:text-blue-700 font-medium">
              Register here
            </Link>
          </p>
          <p className="text-sm text-gray-600">
            <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium">
              Back to Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

