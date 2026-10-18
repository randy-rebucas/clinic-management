export default function AdminOverviewLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading administration" className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded bg-gray-200" />
        <div className="h-4 w-72 rounded bg-gray-100" />
      </div>
      <div className="h-40 rounded-lg border border-gray-200 bg-white" />
      <div className="h-24 rounded-lg border border-gray-200 bg-white" />
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
        <div className="h-80 rounded-lg border border-gray-200 bg-white" />
        <div className="h-80 rounded-lg border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
