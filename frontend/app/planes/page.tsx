import type { Metadata } from 'next';
import { PublicRoute } from '@/components/public-route';
import { jsonLd, pages, softwareGraph } from '@/content/seo';

export const metadata: Metadata = {
  title: pages.planes.title,
  description: pages.planes.description,
  alternates: { canonical: pages.planes.path },
  openGraph: { title: pages.planes.title, description: pages.planes.description, url: pages.planes.path, locale: 'es_LA', type: 'website' },
};

export default function PlanesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareGraph()) }} />
      <PublicRoute view="planes" />
    </>
  );
}
