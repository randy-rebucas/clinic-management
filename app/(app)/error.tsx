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
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-red-50 text-red-600" aria-hidden="true">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="mb-2 text-xl font-extrabold tracking-tight text-gray-900">
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
        type="button"
        onClick={reset}
        className="rounded-md bg-brand-teal-dark px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-teal-deep transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  );
}
