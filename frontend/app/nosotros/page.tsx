import type { Metadata } from 'next';
import { PublicRoute } from '@/components/public-route';
import { pages } from '@/content/seo';

export const metadata: Metadata = {
  title: pages.nosotros.title,
  description: pages.nosotros.description,
  alternates: { canonical: pages.nosotros.path },
  openGraph: { title: pages.nosotros.title, description: pages.nosotros.description, url: pages.nosotros.path, locale: 'es_LA', type: 'website' },
};

export default function NosotrosPage() {
  return <PublicRoute view="nosotros" />;
}
