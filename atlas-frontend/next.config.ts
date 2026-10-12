import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // proxy setup for the backend
  async rewrites() {
      return [
        {
          source: "/flask-api/:path*",
          destination: "http://127.0.0.1:5000/:path*"
        },
      ];
  },
  // Experimental features to help with hydration
  experimental: {
    optimizePackageImports: ['@/components'],
  },
  // Better error handling during development
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Headers for security and hydration
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
