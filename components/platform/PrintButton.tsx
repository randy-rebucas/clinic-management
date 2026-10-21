'use client';

import { PRIMARY } from './platform-api';

export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={PRIMARY}>
      {label}
    </button>
  );
}
