import type { Metadata, Viewport } from 'next';
import './globals.css';
import ThemeRegistry from '@/components/ThemeRegistry';

export const viewport: Viewport = {
  themeColor: '#FF8C00',
};

export const metadata: Metadata = {
  title: 'VideoForge \u2013 Browser Video Converter',
  description:
    'Convert videos entirely in your browser using WebAssembly. No server uploads. MP4, AVI, MOV, MKV, WEBM, GIF.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/videoforge-favicon.svg',
    shortcut: '/videoforge-favicon.svg',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
