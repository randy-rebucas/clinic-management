export default function RoomsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the rooms" className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-28 rounded bg-gray-200" />
        <div className="h-4 w-[26rem] max-w-full rounded bg-gray-100" />
      </div>
      <div className="h-[232px] rounded-lg border border-gray-200 bg-white" />
      <div className="h-10 rounded-md bg-gray-100" />
      <div className="h-80 rounded-lg border border-gray-200 bg-white" />
    </div>
  );
}
