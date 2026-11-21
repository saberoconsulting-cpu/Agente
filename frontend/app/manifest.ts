import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SABERO AI Sales Engine',
    short_name: 'SABERO AI',
    description: 'Agente de ventas con IA para WhatsApp: atiende, agenda y da seguimiento.',
    start_url: '/',
    display: 'standalone',
    background_color: '#071A33',
    theme_color: '#071A33',
    lang: 'es-419',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
