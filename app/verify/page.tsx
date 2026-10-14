import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { normalizeSerial } from '@/lib/document-seal';
import VerifySerialForm from './VerifySerialForm';

export const metadata: Metadata = {
  title: 'Verify a Document',
  description: 'Check that a prescription, certificate or receipt was genuinely issued by the clinic.',
  robots: { index: false, follow: false },
};

export default async function VerifyLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const { serial } = await searchParams;
  const normalized = normalizeSerial(serial);
  if (normalized) {
    redirect(`/verify/${normalized}`);
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Verify a document</h1>
        <p className="mt-2 text-sm text-gray-600">
          Every prescription, medical certificate, laboratory request and official receipt printed by the clinic
          carries a QR code and a 16-character serial. Enter the serial to confirm the document is genuine and
          has not been altered.
        </p>
        {serial && !normalized && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            That serial is not in the expected format (16 letters and digits, e.g. ABCD-EFGH-JKMN-PQRS).
          </p>
        )}
        <VerifySerialForm defaultValue={serial} />
      </div>
    </main>
  );
}
