import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SABERO AI Sales Engine | Agente de ventas conversacional con IA',
    template: '%s | SABERO AI Sales Engine',
  },
  description:
    'Plataforma SaaS para crear agentes de ventas conversacionales con IA que atienden WhatsApp, califican prospectos, usan conocimiento empresarial y agendan reuniones.',
  keywords: [
    'agente de ventas IA',
    'WhatsApp ventas',
    'automatizacion comercial',
    'SABERO Consulting',
    'software a medida',
    'arquitectura cloud',
    'RAG empresarial',
  ],
  metadataBase: new URL('https://agent.saberoconsulting.com'),
  openGraph: {
    title: 'SABERO AI Sales Engine',
    description:
      'Agentes comerciales con IA para vender, calificar leads y cerrar reuniones desde WhatsApp.',
    url: 'https://agent.saberoconsulting.com',
    siteName: 'SABERO AI Sales Engine',
    images: [{ url: '/logo.png', width: 1200, height: 630, alt: 'SABERO AI Sales Engine' }],
    locale: 'es_PE',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SABERO AI Sales Engine',
    description: 'Agente comercial conversacional con IA para empresas.',
    images: ['/logo.png'],
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
