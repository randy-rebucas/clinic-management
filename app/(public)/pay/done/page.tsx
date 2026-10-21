export const metadata = { title: 'Payment', robots: { index: false } };

/** Where PayMongo sends a patient after paying a clinic's payment link. Says nothing about the bill. */
export default async function PayDonePage({ searchParams }: { searchParams: Promise<{ ref?: string; cancelled?: string }> }) {
  const { ref, cancelled } = await searchParams;
  const safeRef = ref && /^[A-Za-z0-9_-]{1,40}$/.test(ref) ? ref : null;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16 text-center">
      {cancelled ? (
        <>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Payment not made</h1>
          <p className="mt-3 text-gray-600">You left before paying, so nothing was charged. You can open the link from the clinic again whenever you’re ready.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Thank you</h1>
          <p className="mt-3 text-gray-600">
            Your payment{safeRef ? (
              <>
                {' '}
                for invoice <span className="font-mono">{safeRef}</span>
              </>
            ) : null}{' '}
            was received. The clinic sees it on your bill within a few minutes, and PayMongo emails you a receipt.
          </p>
        </>
      )}
    </main>
  );
}
