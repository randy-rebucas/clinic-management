'use client';

import { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type QRInputMethod = 'scan' | 'upload' | 'paste';

interface Clinic {
  _id: string;
  name: string;
  displayName: string;
  subdomain: string;
  email?: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export default function PatientLoginClient() {
  const [loginMethod, setLoginMethod] = useState<'code' | 'qr'>('code');
  const [qrInputMethod, setQrInputMethod] = useState<QRInputMethod>('scan');
  const [patientCode, setPatientCode] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasSubdomain, setHasSubdomain] = useState(false);
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [availableClinics, setAvailableClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [showClinicSelection, setShowClinicSelection] = useState(false);
  const router = useRouter();
  
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check for subdomain on mount and get tenant info
  useEffect(() => {
    const checkSubdomain = async () => {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        // Extract potential subdomain (first part)
        const firstPart = parts[0]?.toLowerCase();
        // 'www' is not a subdomain - treat it as root domain
        const isWww = firstPart === 'www';
        // If hostname has more than 2 parts AND first part is not 'www', we have a subdomain
        // Or if 2 parts and first is not 'localhost' or 'www'
        const hasSubdomain = !isWww && (
          (parts.length > 2) || 
          (parts.length === 2 && firstPart !== 'localhost')
        );
        setHasSubdomain(hasSubdomain);
        
        if (!hasSubdomain) {
          // No subdomain (including www), fetch available clinics
          fetchClinics();
          setShowClinicSelection(true);
        } else {
          // Has subdomain, get tenant info
          try {
            const subdomain = firstPart;
            const res = await fetch(`/api/tenants/public?subdomain=${subdomain}`);
            if (res.ok) {
              const data = await res.json();
              if (data.success && data.tenant) {
                setSelectedClinic(data.tenant);
              }
            }
          } catch (error) {
            console.error('Failed to fetch tenant info:', error);
          }
        }
        setLoadingClinics(false);
      }
    };
    
    checkSubdomain();
  }, []);

  const fetchClinics = async () => {
    try {
      setLoadingClinics(true);
      const res = await fetch('/api/tenants/public');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.tenants) {
          setAvailableClinics(data.tenants);
        }
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error);
    } finally {
      setLoadingClinics(false);
    }
  };

  const handleClinicSelect = (clinic: Clinic) => {
    setSelectedClinic(clinic);
    // Redirect to clinic's subdomain for login
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol;
      const rootDomain = window.location.hostname.split('.').slice(-2).join('.');
      const port = window.location.port ? `:${window.location.port}` : '';
      const loginUrl = `${protocol}//${clinic.subdomain}.${rootDomain}${port}/patient/login`;
      window.location.href = loginUrl;
    }
  };

  const performQRLogin = useCallback(async (qrData: string) => {
    setLoading(true);
    setError(null);

    try {
      // Parse QR data to add tenantId if needed
      let parsedQrData = qrData;
      try {
        const qrObj = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
        if (selectedClinic && !qrObj.tenantId) {
          qrObj.tenantId = selectedClinic._id;
          parsedQrData = JSON.stringify(qrObj);
        }
      } catch (e) {
        // If parsing fails, use original data
      }

      const res = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          qrCode: parsedQrData,
          ...(selectedClinic && { tenantId: selectedClinic._id }),
        }),
      });

      const data = await res.json();

      if (data.success) {
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
  }, [selectedClinic, router]);

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
      if (loginMethod === 'qr' && qrInputMethod === 'scan' && !showClinicSelection) {
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
            () => {} // Ignore errors during scanning
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
  }, [loginMethod, qrInputMethod, showClinicSelection, handleQRScanned]);

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
        timestamp: Date.now(),
        ...(selectedClinic && { tenantId: selectedClinic._id }),
      });

      // Use QR login endpoint directly - it supports lookup by patientCode
      const loginRes = await fetch('/api/patients/qr-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          qrCode: qrData,
          ...(selectedClinic && { tenantId: selectedClinic._id }),
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

  // Show clinic selection if no subdomain
  if (showClinicSelection && !hasSubdomain) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-lg mb-4">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Patient Portal Login</h1>
            <p className="text-gray-600">Select your clinic to continue</p>
          </div>

          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6">
            {loadingClinics ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-base text-gray-600">Loading clinics...</p>
                </div>
              </div>
            ) : availableClinics.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 mb-4">No clinics available at the moment.</p>
                <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Register a new clinic
                </Link>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {availableClinics.map((clinic) => (
                  <button
                    key={clinic._id}
                    type="button"
                    onClick={() => handleClinicSelect(clinic)}
                    className="w-full p-4 border-2 border-gray-200 rounded-lg text-left hover:border-blue-300 hover:bg-blue-50 transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">{clinic.displayName || clinic.name}</h4>
                        {clinic.address && (clinic.address.city || clinic.address.state) && (
                          <p className="text-sm text-gray-600 mb-1">
                            {[clinic.address.city, clinic.address.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {clinic.phone && (
                          <p className="text-xs text-gray-500">📞 {clinic.phone}</p>
                        )}
                      </div>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                Don&apos;t see your clinic?{' '}
                <Link href="/tenant-onboard" className="text-blue-600 hover:text-blue-700 font-semibold">
                  Register a new clinic
                </Link>
              </p>
            </div>
          </div>

          <div className="text-center mt-6">
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
                stopScanner();
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
              <div className="space-y-4">
                {/* QR Input Method Tabs */}
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setQrInputMethod('scan');
                      setError(null);
                      setCameraError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      qrInputMethod === 'scan'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
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
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      qrInputMethod === 'upload'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
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
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      qrInputMethod === 'paste'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
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
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                        <svg className="w-10 h-10 mx-auto text-amber-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm text-amber-700 mb-3">{cameraError}</p>
                        <button
                          type="button"
                          onClick={() => setQrInputMethod('upload')}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
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
                      className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
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
                  <form onSubmit={handleQRLogin} className="space-y-4">
                    <div>
                      <label htmlFor="qrCode" className="block text-sm font-medium text-gray-700 mb-2">
                        QR Code Data
                      </label>
                      <textarea
                        id="qrCode"
                        value={qrCode}
                        onChange={(e) => setQrCode(e.target.value)}
                        placeholder='{"patientId":"...","patientCode":"CLINIC-0001","type":"patient_login"}'
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
                      disabled={loading || !qrCode.trim()}
                      className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Logging in...' : 'Login with QR Code'}
                    </button>
                  </form>
                )}
              </div>
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
