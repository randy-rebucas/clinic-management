'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { FOCUS_RING, Svg } from '../appointments/shared';

const MORE = 'M5 12h.01M12 12h.01M19 12h.01';

export interface MoreMenuItem {
  label: string;
  href?: string;
  /** A document route rather than an app page: a plain link, opened in a new tab unless it downloads. */
  document?: 'open' | 'download';
  onClick?: () => void;
}

/** The "⋯" button on a record page's header: secondary actions, as links or buttons. Renders nothing when empty. */
export default function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const itemClass = 'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-teal';
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${ids}-menu`}
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-md border border-gray-300 bg-white p-2 text-gray-700 transition-colors hover:border-gray-900 ${FOCUS_RING}`}
      >
        <Svg d={MORE} />
      </button>
      {open && (
        <ul id={`${ids}-menu`} className="motion-panel-in absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-1 shadow-[0_8px_30px_rgb(15,23,42,0.1)]">
          {items.map((it) => (
            <li key={it.label}>
              {it.href && it.document ? (
                <a
                  href={it.href}
                  className={itemClass}
                  onClick={() => setOpen(false)}
                  {...(it.document === 'open' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {it.label}
                </a>
              ) : it.href ? (
                <Link href={it.href} className={itemClass} onClick={() => setOpen(false)}>
                  {it.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {it.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
