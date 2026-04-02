"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl">
        ⚠
      </div>
      <h2 className="mb-2 text-xl font-bold text-gray-900">
        Something went wrong
      </h2>
      <p className="mb-6 max-w-sm text-sm text-gray-500">
        An error occurred while loading this page. Please try again.
        {error.digest && (
          <span className="mt-1 block font-mono text-xs text-gray-400">
            ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
