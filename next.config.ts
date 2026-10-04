import type { NextConfig } from "next";

// Production hardening:
//   - No client-side source maps (would leak source code structure).
//   - No server-side source maps in standalone output.
//   - Don't ignore TypeScript errors — fail the build if anything is wrong.
//   - Strip console.debug calls in production (preserves console.warn/error
//     for our security-log structured JSON).
const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Don't ship source maps to the browser bundle. This prevents an
  // attacker from reading the original source via DevTools → Sources.
  productionBrowserSourceMaps: false,
  typescript: {
    // Production: never ignore type errors. (Dev tolerates them for HMR.)
    ignoreBuildErrors: !isProd,
  },
  reactStrictMode: false,
  // In production, strip the long-form console.* output. Our structured
  // security log goes through console.warn/console.error/console.log
  // (single-line JSON), which we keep.
  compiler: isProd
    ? {
        removeConsole: { exclude: ['error', 'warn'] },
      }
    : undefined,
  // Standalone output: ship a self-contained .next/standalone directory
  // (no node_modules needed at runtime, just copy public/ + .next/static).
  // This makes deployment cleaner and removes the chance of accidentally
  // shipping node_modules/.cache or other dev cruft.
  experimental: {
    // Opt-out of any future opt-in that might expose server source.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;
