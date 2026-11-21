'use client';

import { PublicSite } from '@/components/public-site';

/** Crawlable public pages (/planes, /nosotros): server-rendered, and after sign-in the user continues at the dashboard. */
export function PublicRoute({ view }: { view: 'nosotros' | 'planes' }) {
  return <PublicSite initialView={view} onReady={() => window.location.assign('/')} />;
}
