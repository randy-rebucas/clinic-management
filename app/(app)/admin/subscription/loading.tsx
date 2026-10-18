export default function SubscriptionLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the subscription" className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded bg-gray-200" />
        <div className="h-4 w-72 max-w-full rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="h-56 rounded-lg border border-gray-200 bg-white lg:col-span-3" />
        <div className="h-56 rounded-lg border border-gray-200 bg-white lg:col-span-2" />
      </div>
      <div className="h-7 w-24 rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-[30rem] rounded-lg border border-gray-200 bg-white" />
        <div className="h-[30rem] rounded-lg border border-gray-200 bg-white" />
        <div className="h-[30rem] rounded-lg border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
