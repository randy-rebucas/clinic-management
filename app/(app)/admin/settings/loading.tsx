export default function ClinicSettingsLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading clinic settings" className="max-w-6xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-4 w-[32rem] max-w-full rounded bg-gray-100" />
      </div>
      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-10">
        <div className="hidden lg:block space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-6 rounded bg-gray-100" />
          ))}
        </div>
        <div className="space-y-8">
          {[320, 380, 200].map((h) => (
            <div key={h} className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-4 w-48 rounded bg-gray-100" />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white" style={{ height: h }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
