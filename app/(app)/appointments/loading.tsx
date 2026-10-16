export default function AppointmentsLoading() {
  return (
    <section role="status" aria-busy="true" aria-label="Loading appointments" className="px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-48 rounded bg-gray-200" />
            <div className="h-4 w-72 rounded bg-gray-100" />
          </div>
          <div className="hidden sm:flex gap-2">
            <div className="h-9 w-32 rounded-md bg-gray-100" />
            <div className="h-9 w-40 rounded-md bg-gray-200" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 lg:order-2">
            <div className="h-12 w-72 rounded bg-gray-100" />
            <div className="h-56 rounded-lg border border-gray-200 bg-white" />
            <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                  <div className="h-8 w-20 rounded bg-gray-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 rounded bg-gray-100" />
                    <div className="h-3 w-24 rounded bg-gray-50" />
                  </div>
                  <div className="h-5 w-16 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 lg:order-1">
            <div className="h-[22rem] rounded-lg border border-gray-200 bg-white" />
            <div className="h-48 rounded-lg border border-gray-200 bg-white" />
          </div>
        </div>
      </div>
    </section>
  );
}
