'use client';

import { useEffect, useState } from 'react';
import { apiRequest, SessionUser } from '../lib/api';
import { DashboardApp } from '../components/dashboard';
import { LoginScreen } from '../components/login';

export default function HomePage() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        await apiRequest<SessionUser>('/auth/me');
        setAuthenticated(true);
      } catch {
        setAuthenticated(false);
      } finally {
        setReady(true);
      }
    }
    void check();
  }, []);

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center bg-sabero-navy text-white">
        <div className="h-14 w-14 animate-pulse rounded-2xl bg-sabero-electric shadow-neon" />
      </main>
    );
  }

  if (!authenticated) {
    return <LoginScreen onReady={() => setAuthenticated(true)} />;
  }

  return <DashboardApp onLogout={() => setAuthenticated(false)} />;
}
