import type { NextConfig } from 'next';

const outputMode = process.env.NEXT_OUTPUT_MODE === 'export' ? 'export' : 'standalone';

const nextConfig: NextConfig = {
  // Enables a self-contained runtime in `.next/standalone` for release packaging.
  output: outputMode,
  turbopack: {
    resolveAlias: {
      '@ffmpeg/ffmpeg': '@ffmpeg/ffmpeg/dist/umd/ffmpeg.js',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
