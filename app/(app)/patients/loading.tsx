export default function PatientsLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-28 bg-gray-200 rounded" />
        <div className="h-9 w-32 bg-gray-200 rounded-lg" />
      </div>
      {/* Search/filter bar */}
      <div className="h-10 w-full bg-gray-100 rounded-lg" />
      {/* Patient cards */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6 flex items-center gap-4 justify-between"
        >
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-gray-200 flex-shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="h-3 w-28 bg-gray-100 rounded" />
              <div className="h-3 w-20 bg-gray-100 rounded" />
            </div>
          </div>
          <div className="h-8 w-20 bg-gray-100 rounded-lg flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
