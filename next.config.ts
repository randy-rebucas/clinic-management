import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Note: The "Invalid source map" error in development is a known Turbopack issue
  // in Next.js 16.0.3. It doesn't affect functionality - it's a dev tooling issue.
  // The application works correctly despite this warning.
};

export default nextConfig;
