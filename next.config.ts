import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable strict mode for better error handling
  reactStrictMode: true,

  // Allow dev origins for reverse proxy setup
  allowedDevOrigins: ['app.rustplus.online', 'shim.rustplus.online'],

  // Security headers for production
  async headers() {
    return [
      {
        source: '/:path*',
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
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
