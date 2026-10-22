'use client';

import { useEffect } from 'react';

/**
 * iPadOS 13+ sends a desktop Mac User-Agent, so the server can't tell it from a Mac.
 * A touch-capable "Mac" is an iPad: send it to the App Store from here.
 */
export default function IpadStoreRedirect({ appStoreUrl }: { appStoreUrl: string }) {
  useEffect(() => {
    if (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) {
      window.location.replace(appStoreUrl);
    }
  }, [appStoreUrl]);
  return null;
}
