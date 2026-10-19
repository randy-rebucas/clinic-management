import { FOCUS_RING } from '../appointments/shared';

/**
 * Companion to a print button: downloads the same sealed document as a PDF
 * (the print route with ?format=pdf&download=1). Each download is a sealed, logged copy.
 */
export default function PdfLink({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  const url = `${href}${href.includes('?') ? '&' : '?'}format=pdf&download=1`;
  return (
    <a
      href={url}
      onClick={onClick}
      aria-label={`Download ${label} as PDF`}
      title={`Download ${label} as PDF`}
      className={`inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 ${FOCUS_RING}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
      </svg>
      PDF
    </a>
  );
}
