import type { NextConfig } from 'next';
import path from 'node:path';

function storageRemotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const patterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
    {
      protocol: 'https',
      hostname: 'www.figma.com',
      pathname: '/api/mcp/asset/**',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      pathname: '/**',
    },
    {
      protocol: 'http',
      hostname: '127.0.0.1',
      pathname: '/**',
    },
  ];

  const publicUrl = process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? process.env.S3_PUBLIC_URL;
  if (publicUrl) {
    try {
      const parsed = new URL(publicUrl);
      const protocol = parsed.protocol.replace(':', '') as 'http' | 'https';
      patterns.push({
        protocol,
        hostname: parsed.hostname,
        pathname: '/**',
      });
    } catch {
      // Ignore invalid storage URL at build time.
    }
  }

  return patterns;
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Monorepo: trace files from the workspace root (TTW-063 images).
  outputFileTracingRoot: path.join(__dirname, '../..'),
  images: {
    remotePatterns: storageRemotePatterns(),
  },
};

export default nextConfig;
