import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VideoForge \u2013 Browser Video Converter',
    short_name: 'VideoForge',
    description: 'Convert videos in your browser using WebAssembly \u2014 no uploads required',
    start_url: '/',
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#FF8C00',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
