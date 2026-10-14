export default function VerifySerialForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/verify" method="get" className="mt-6 flex flex-col gap-3 sm:flex-row">
      <label htmlFor="serial" className="sr-only">
        Document serial
      </label>
      <input
        id="serial"
        name="serial"
        required
        defaultValue={defaultValue}
        autoComplete="off"
        spellCheck={false}
        placeholder="XXXX-XXXX-XXXX-XXXX"
        className="flex-1 rounded-md border border-gray-300 px-3 py-2 font-mono uppercase tracking-wider text-gray-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
      />
      <button
        type="submit"
        className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600/40"
      >
        Verify
      </button>
    </form>
  );
}
