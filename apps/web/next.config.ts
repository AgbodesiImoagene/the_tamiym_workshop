import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the workspace root (TTW-063 images).
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.figma.com',
        pathname: '/api/mcp/asset/**',
      },
    ],
  },
};

export default nextConfig;
