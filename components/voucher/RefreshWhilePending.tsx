'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads the page every few seconds while the payment is being confirmed (up to ~2 minutes). */
export default function RefreshWhilePending() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (tries > 30) clearInterval(id);
      else router.refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
