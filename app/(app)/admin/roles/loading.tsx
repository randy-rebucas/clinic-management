export default function RolesLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading roles" className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded bg-gray-200" />
        <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
        <div className="h-72 rounded-lg border border-gray-200 bg-white" />
        <div className="h-[32rem] rounded-lg border border-gray-200 bg-white" />
      </div>
    </div>
  );
}
