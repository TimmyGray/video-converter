import type { Metadata } from 'next';
import './globals.css';
import ThemeRegistry from '@/components/ThemeRegistry';

export const metadata: Metadata = {
  title: 'VideoForge \u2013 Browser Video Converter',
  description:
    'Convert videos entirely in your browser using WebAssembly. No server uploads. MP4, AVI, MOV, MKV, WEBM, GIF.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#FF8C00" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
