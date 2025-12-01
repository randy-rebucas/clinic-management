"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scanner } from 'react-scanner';

export default function PatientQRSearch() {
  const [qrResult, setQrResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleScan = (result: string | null) => {
    if (result) {
      setQrResult(result);
      router.push(`/patients/${result}`);
    }
  };

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-2">Scan Patient QR Code</h2>
      {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
      <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col items-center">
        <Scanner
          onResult={handleScan}
          onError={(err: Error) => setError('QR scan error: ' + (err?.message || 'Unknown error'))}
          constraints={{ facingMode: 'environment' }}
          className="w-full"
        />
        <p className="text-xs text-gray-500 mt-2">Scan a patient's QR code to view their record instantly.</p>
      </div>
      {qrResult && (
        <div className="mt-2 text-green-700 text-sm">Found Patient ID: {qrResult}</div>
      )}
    </div>
  );
}
