'use client';

import { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type QRInputMethod = 'scan' | 'upload' | 'paste';

export default function PatientLoginClient() {
  const [loginMethod, setLoginMethod] = useState<'code' | 'qr'>('code');
  const [qrInputMethod, setQrInputMethod] = useState<QRInputMethod>('scan');
  const [patientCode, setPatientCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const router = useRouter();

  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const performQRLogin = useCallback(async (qrData: string) => {
    setLoading(true);
    setError(null);

    try {
      // Parse QR data to add tenantId if needed
      const parsedQrData = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
      const res = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: parsedQrData
        }),
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
  }, [router]);

  const handleQRScanned = useCallback(async (decodedText: string) => {
    // Stop scanner after successful scan
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop().catch(console.error);
      setScannerReady(false);
    }

    setQrCode(decodedText);
    // Auto-submit after scanning
    await performQRLogin(decodedText);
  }, [performQRLogin]);

  // Initialize scanner when QR tab and scan method are selected
  useEffect(() => {
    let html5QrCode: any = null;

    const initScanner = async () => {
      if (loginMethod === 'qr' && qrInputMethod === 'scan') {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');

          // Small delay to ensure DOM element exists
          await new Promise(resolve => setTimeout(resolve, 100));

          const element = document.getElementById('qr-reader');
          if (!element) return;

          html5QrCode = new Html5Qrcode('qr-reader');
          scannerRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: 'environment' },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
            },
            (decodedText: string) => {
              handleQRScanned(decodedText);
            },
            () => { } // Ignore errors during scanning
          );

          setScannerReady(true);
          setCameraError(null);
        } catch (err: any) {
          console.error('Scanner error:', err);
          setCameraError(err.message || 'Unable to access camera. Please try uploading an image instead.');
          setScannerReady(false);
        }
      }
    };

    initScanner();

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(console.error);
      }
      scannerRef.current = null;
      setScannerReady(false);
    };
  }, [loginMethod, qrInputMethod, handleQRScanned]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const html5QrCode = new Html5Qrcode('qr-file-reader');

      const result = await html5QrCode.scanFile(file, true);
      setQrCode(result);

      // Auto-submit after successful scan
      await performQRLogin(result);
    } catch (err: any) {
      console.error('File scan error:', err);
      setError('Could not read QR code from image. Please try a clearer image or use another method.');
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCodeLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Create QR code data for login directly with patient code
      const qrData = JSON.stringify({
        patientCode: patientCode,
        type: 'patient_login',
        timestamp: Date.now()
      });

      // Use QR login endpoint directly - it supports lookup by patientCode
      const loginRes = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCode: qrData
        }),
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
    await performQRLogin(qrCode);
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop().catch(console.error);
      setScannerReady(false);
    }
  };


  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Abstract Background Elements */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"></div>
        <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 -right-4 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-96 h-96 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
        <div className="absolute top-20 right-10 w-72 h-72 border-4 border-blue-200/20 rotate-45 rounded-3xl"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl sm:rounded-3xl shadow-xl mb-4 sm:mb-6 transform hover:scale-105 transition-transform">
            <svg className="w-10 h-10 sm:w-12 sm:h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 mb-3 tracking-tight">Patient Portal Login</h1>
          <p className="text-base sm:text-lg text-gray-600">Access your medical records and appointments</p>
        </div>

        {/* Login Method Tabs */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-200/50 overflow-hidden mb-4 sm:mb-6">
          <div className="flex border-b border-gray-200/50 bg-gradient-to-r from-gray-50 to-blue-50/30">
            <button
              onClick={() => {
                stopScanner();
                setLoginMethod('code');
                setError(null);
              }}
              className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-semibold transition-all ${loginMethod === 'code'
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-700 border-b-2 border-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
              Patient Code
            </button>
            <button
              onClick={() => {
                setLoginMethod('qr');
                setError(null);
              }}
              className={`flex-1 px-4 sm:px-6 py-3 sm:py-4 text-sm sm:text-base font-semibold transition-all ${loginMethod === 'qr'
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-700 border-b-2 border-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                }`}
            >
              QR Code
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50/90 backdrop-blur-sm border-2 border-red-200 rounded-xl sm:rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 shadow-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm sm:text-base text-red-800 font-semibold">{error}</p>
                </div>
              </div>
            )}

            {/* Patient Code Login */}
            {loginMethod === 'code' && (
              <form onSubmit={handleCodeLogin} className="space-y-4 sm:space-y-6">
                <div>
                  <label htmlFor="patientCode" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                    Patient Code
                  </label>
                  <input
                    id="patientCode"
                    type="text"
                    value={patientCode}
                    onChange={(e) => setPatientCode(e.target.value.toUpperCase())}
                    placeholder="CLINIC-0001"
                    required
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 text-base"
                    disabled={loading}
                  />
                  <p className="text-xs sm:text-sm text-gray-500 mt-2">
                    Enter the patient code you received during registration
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-base sm:text-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Logging in...
                    </span>
                  ) : (
                    'Login'
                  )}
                </button>
              </form>
            )}

            {/* QR Code Login */}
            {loginMethod === 'qr' && (
              <div className="space-y-4">
                {/* QR Input Method Tabs */}
                <div className="flex bg-gradient-to-r from-gray-100 to-blue-50/30 rounded-xl p-1.5 sm:p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQrInputMethod('scan');
                      setError(null);
                      setCameraError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${qrInputMethod === 'scan'
                        ? 'bg-white text-blue-700 shadow-md'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setQrInputMethod('upload');
                      setError(null);
                      setCameraError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${qrInputMethod === 'upload'
                        ? 'bg-white text-blue-700 shadow-md'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopScanner();
                      setQrInputMethod('paste');
                      setError(null);
                      setCameraError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${qrInputMethod === 'paste'
                        ? 'bg-white text-blue-700 shadow-md'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Paste
                  </button>
                </div>

                {/* Camera Scanner */}
                {qrInputMethod === 'scan' && (
                  <div className="space-y-3">
                    {cameraError ? (
                      <div className="bg-amber-50/90 backdrop-blur-sm border-2 border-amber-200 rounded-xl sm:rounded-2xl p-5 sm:p-6 text-center shadow-lg">
                        <svg className="w-12 h-12 mx-auto text-amber-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm sm:text-base text-amber-700 mb-4 font-medium">{cameraError}</p>
                        <button
                          type="button"
                          onClick={() => setQrInputMethod('upload')}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg transform hover:scale-105 text-sm"
                        >
                          Try uploading an image instead
                        </button>
                      </div>
                    ) : (
                      <>
                        <div
                          id="qr-reader"
                          className="w-full rounded-lg overflow-hidden bg-gray-900"
                          style={{ minHeight: '280px' }}
                        />
                        {!scannerReady && !cameraError && (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            <span className="ml-2 text-sm text-gray-600">Starting camera...</span>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 text-center">
                          Point your camera at the QR code from your registration
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* File Upload */}
                {qrInputMethod === 'upload' && (
                  <div className="space-y-3">
                    {/* Hidden element for html5-qrcode file scanning */}
                    <div id="qr-file-reader" style={{ display: 'none' }}></div>

                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-gray-300 rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-gradient-to-br hover:from-blue-50 hover:to-indigo-50 transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02]"
                    >
                      <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm font-medium text-gray-700 mb-1">
                        Click to upload QR code image
                      </p>
                      <p className="text-xs text-gray-500">
                        PNG, JPG, or GIF up to 10MB
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={loading}
                    />
                    {loading && (
                      <div className="flex items-center justify-center py-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="ml-2 text-sm text-gray-600">Processing image...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual Paste */}
                {qrInputMethod === 'paste' && (
                  <form onSubmit={handleQRLogin} className="space-y-4 sm:space-y-6">
                    <div>
                      <label htmlFor="qrCode" className="block text-sm sm:text-base font-semibold text-gray-700 mb-2">
                        QR Code Data
                      </label>
                      <textarea
                        id="qrCode"
                        value={qrCode}
                        onChange={(e) => setQrCode(e.target.value)}
                        placeholder='{"patientId":"...","patientCode":"CLINIC-0001","type":"patient_login"}'
                        rows={5}
                        required
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white/50 backdrop-blur-sm hover:border-blue-300 font-mono text-sm"
                        disabled={loading}
                      />
                      <p className="text-xs sm:text-sm text-gray-500 mt-2">
                        Paste the QR code data from your registration confirmation
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !qrCode.trim()}
                      className="w-full px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-base sm:text-lg"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Logging in...
                        </span>
                      ) : (
                        'Login with QR Code'
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Links */}
        <div className="text-center space-y-3 sm:space-y-4 mt-6 sm:mt-8">
          <p className="text-sm sm:text-base text-gray-600">
            Don&apos;t have a patient code?{' '}
            <Link href="/onboard" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
              Register here
            </Link>
          </p>
          <p className="text-sm sm:text-base text-gray-600">
            <Link href="/" className="text-blue-600 hover:text-blue-700 font-semibold underline decoration-2 underline-offset-2">
              Back to Home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
