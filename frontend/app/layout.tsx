import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ActionConfirmationProvider } from '@/components/action-confirmation';
import { jsonLd, keywords, pages, siteGraph, siteUrl } from '@/content/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: pages.home.title,
    template: '%s | SABERO AI',
  },
  description: pages.home.description,
  keywords,
  applicationName: 'SABERO AI Sales Engine',
  authors: [{ name: 'SABERO Consulting', url: siteUrl }],
  creator: 'SABERO Consulting',
  publisher: 'SABERO Consulting',
  category: 'business',
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  openGraph: {
    title: pages.home.title,
    description: pages.home.description,
    url: siteUrl,
    siteName: 'SABERO AI Sales Engine',
    images: [{ url: '/logo.png', width: 2048, height: 768, alt: 'SABERO AI Sales Engine, agente de ventas con IA' }],
    locale: 'es_LA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: pages.home.title,
    description: pages.home.description,
    images: ['/logo.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#071A33',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-419" translate="no">
      <head>
        <meta name="google" content="notranslate" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(siteGraph()) }} />
      </head>
      <body>
        <ActionConfirmationProvider>{children}</ActionConfirmationProvider>
      </body>
    </html>
  );
}
