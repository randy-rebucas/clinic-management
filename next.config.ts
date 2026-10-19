import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs/config";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const sentryEnabled = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
const sentryCanUpload = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const nextConfig: NextConfig = {
  /* config options here */
  // Note: The "Invalid source map" error in development is a known Turbopack issue
  // in Next.js 16.0.3. It doesn't affect functionality - it's a dev tooling issue.
  // The application works correctly despite this warning.
  
  // Production optimizations
  compress: true,
  poweredByHeader: false, // Remove X-Powered-By header for security

  // Dev-only: allow requests from local dev origins for HMR and assets
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static.vecteezy.com',
        pathname: '/**',
      },
    ],
  },
  
  // Security headers (also handled in middleware, but good to have here too)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()'
          },
          // Content-Security-Policy is set per request in proxy.ts (single source of truth)
        ],
      },
      // Service worker — must never be cached by the browser
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
  
  // PDF rendering (lib/pdf.ts) loads the Chromium binary from disk at runtime, which the
  // tracer can't see; ship it only with the routes that can return ?format=pdf.
  outputFileTracingIncludes: Object.fromEntries(
    [
      '/api/prescriptions/[id]/print',
      '/api/visits/[id]/print/medical-certificate',
      '/api/visits/[id]/print/lab-request',
      '/api/referrals/[id]/letter',
      '/api/invoices/[id]/receipt',
      '/api/rx/[token]',
    ].map((route) => [route.replace(/[[\]]/g, '\\$&'), ['./node_modules/@sparticuz/chromium/bin/**/*']])
  ),

  // Turbopack configuration (Next.js 16 uses Turbopack by default)
  // Empty config to silence the warning about webpack vs turbopack
  turbopack: {},
};

// Always inline the browser DSN (empty when unset): Turbopack leaves an undefined NEXT_PUBLIC_* var
// as a runtime lookup, which would keep the lazy Sentry chunks in the build.
nextConfig.env = {
  ...nextConfig.env,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? process.env.SENTRY_TRACES_SAMPLE_RATE ?? "",
};

// Without a DSN or upload credentials Sentry's build plugin is not applied at all.
// With a DSN it provides the /monitoring tunnel rewrite (browser events stay same-origin, so the
// CSP connect-src 'self' covers them); source maps are only uploaded when credentials are set.
const withSentry = (config: NextConfig): NextConfig =>
  sentryEnabled || sentryCanUpload
    ? withSentryConfig(config, {
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        silent: !sentryCanUpload,
        telemetry: false,
        tunnelRoute: "/monitoring",
        sourcemaps: { disable: !sentryCanUpload },
        release: { create: sentryCanUpload, finalize: sentryCanUpload },
        widenClientFileUpload: sentryCanUpload,
      })
    : config;

export default withSentry(withBundleAnalyzer(nextConfig));
