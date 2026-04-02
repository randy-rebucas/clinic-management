export default function PatientDetailLoading() {
  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 animate-pulse">

          {/* Header card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              {/* Back button placeholder */}
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Avatar */}
                  <div className="w-16 h-16 rounded-xl bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Name */}
                    <div className="h-8 w-64 bg-gray-200 rounded" />
                    {/* Badges */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="h-5 w-20 bg-gray-100 rounded-full" />
                      <div className="h-4 w-24 bg-gray-100 rounded" />
                      <div className="h-5 w-14 bg-gray-100 rounded-full" />
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="h-10 w-28 bg-gray-100 rounded-lg" />
                    <div className="h-10 w-20 bg-gray-200 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact info row */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex-shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-12 bg-gray-200 rounded" />
                    <div className="h-3 w-32 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="h-3 w-24 bg-gray-200 rounded mb-3" />
                <div className="h-7 w-20 bg-gray-300 rounded mb-1" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>

          {/* Tabs + content */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Tab bar */}
            <div className="border-b border-gray-200 bg-gray-50/50 flex gap-1 px-4 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 w-24 bg-gray-200 rounded-lg" />
              ))}
            </div>
            {/* Tab content */}
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="h-3 w-28 bg-gray-200 rounded" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
