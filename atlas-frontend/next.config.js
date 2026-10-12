/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // proxy setup for the backend
  async rewrites() {
      return [
        {
          source: "/flask-api/:path*",
          //destination: "http://localhost:5000/:path*"
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
  // Disable webpack caching to fix Windows ESM loader issues
  webpack: (config, { isServer }) => {
    config.cache = false;
    // Ensure proper file:// URL handling on Windows
    config.output.assetModuleFilename = 'static/assets/[hash][ext]';
    
    // Fix Windows ESM path handling for CSS loaders
    if (process.platform === 'win32') {
      // Disable source maps to avoid path issues
      config.module.rules.forEach((rule) => {
        if (rule.use && Array.isArray(rule.use)) {
          rule.use.forEach((loader) => {
            if (typeof loader === 'object' && loader.options) {
              // Disable sourceMap for CSS-related loaders
              if (
                loader.loader?.includes('css') ||
                loader.loader?.includes('style') ||
                loader.loader?.includes('postcss')
              ) {
                loader.options.sourceMap = false;
              }
            }
          });
        } else if (rule.use && typeof rule.use === 'object' && rule.use.options) {
          // Handle single loader case
          if (
            rule.use.loader?.includes('css') ||
            rule.use.loader?.includes('style') ||
            rule.use.loader?.includes('postcss')
          ) {
            rule.use.options.sourceMap = false;
          }
        }
      });
    }
    
    return config;
  },
};

module.exports = nextConfig;