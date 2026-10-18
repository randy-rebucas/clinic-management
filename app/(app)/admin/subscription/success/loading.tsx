export default function SubscriptionReturnLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Opening the payment" className="mx-auto max-w-xl pt-4 sm:pt-10 animate-pulse">
      <div className="h-48 rounded-lg border border-gray-200 bg-white" />
    </div>
  );
}
