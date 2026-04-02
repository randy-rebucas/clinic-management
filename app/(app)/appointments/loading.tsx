export default function AppointmentsLoading() {
  return (
    <div className="p-4 sm:p-6 space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-36 bg-gray-200 rounded" />
        <div className="h-9 w-36 bg-gray-200 rounded-lg" />
      </div>
      {/* Date/filter bar */}
      <div className="flex gap-3">
        <div className="h-10 w-40 bg-gray-100 rounded-lg" />
        <div className="h-10 w-40 bg-gray-100 rounded-lg" />
      </div>
      {/* Appointment rows */}
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4"
        >
          <div className="w-1 h-12 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <div className="h-3 w-14 bg-gray-200 rounded" />
              <div className="h-3 w-16 bg-gray-100 rounded" />
            </div>
            <div className="h-4 w-44 bg-gray-200 rounded" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
          <div className="h-6 w-20 bg-gray-100 rounded-full flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}
