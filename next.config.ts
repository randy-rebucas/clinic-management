import type { NextConfig } from "next";

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
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            // CSP is also applied dynamically in middleware.ts for API routes.
            // This covers page responses that bypass the middleware matcher.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.paypalobjects.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://images.unsplash.com https://static.vecteezy.com https://res.cloudinary.com",
              "font-src 'self'",
              "connect-src 'self' https://api.paypal.com https://www.paypal.com",
              "frame-src 'self' https://www.paypal.com",
              "worker-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
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
  
  // Turbopack configuration (Next.js 16 uses Turbopack by default)
  // Empty config to silence the warning about webpack vs turbopack
  turbopack: {},
};

export default nextConfig;
