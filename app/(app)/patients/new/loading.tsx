export default function NewPatientLoading() {
  return (
    <section className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-6 animate-pulse">

          {/* Header card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-lg bg-gray-100 flex-shrink-0 mt-1" />
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="space-y-2">
                  <div className="h-8 w-40 bg-gray-200 rounded" />
                  <div className="h-4 w-56 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-8">

            {/* Section: Basic Info */}
            <div className="space-y-4">
              <div className="h-4 w-32 bg-gray-200 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                    <div className="h-10 w-full bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Section: Contact */}
            <div className="space-y-4">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                    <div className="h-10 w-full bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Section: Emergency contact */}
            <div className="space-y-4">
              <div className="h-4 w-40 bg-gray-200 rounded" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                    <div className="h-10 w-full bg-gray-100 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Submit buttons */}
            <div className="flex justify-end gap-3">
              <div className="h-10 w-24 bg-gray-100 rounded-lg" />
              <div className="h-10 w-32 bg-gray-200 rounded-lg" />
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
