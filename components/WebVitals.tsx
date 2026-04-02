"use client";

import { useReportWebVitals } from "next/web-vitals";

export default function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "development") {
      console.log(metric);
      return;
    }
    // In production, send to your analytics endpoint.
    // Replace with your preferred analytics service (e.g. Vercel Analytics,
    // Google Analytics, PostHog, etc.).
    // Example:
    // navigator.sendBeacon('/api/vitals', JSON.stringify(metric));
  });

  return null;
}
