export default function ServicesLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the price list" className="max-w-7xl mx-auto flex flex-col gap-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded bg-gray-200" />
        <div className="h-4 w-[28rem] max-w-full rounded bg-gray-100" />
      </div>
      <div className="h-[244px] rounded-lg border border-gray-200 bg-white" />
      <div className="h-40 rounded-lg border border-gray-200 bg-white" />
      <div className="h-10 rounded-md bg-gray-100" />
      <div className="h-96 rounded-lg border border-gray-200 bg-white" />
    </div>
  );
}
