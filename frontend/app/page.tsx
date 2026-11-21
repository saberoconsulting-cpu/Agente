'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest, SESSION_EXPIRED_EVENT, SESSION_EXPIRED_MESSAGE, SessionUser } from '@/lib/api';
import { DashboardApp } from '@/components/dashboard';
import { LoginScreen } from '@/components/login';
import { PublicSite } from '@/components/public-site';

/**
 * The public site is rendered on the server (so search engines read the real content) and the
 * session check runs afterwards: a signed-in user is switched to the dashboard once confirmed.
 * If the session can no longer be renewed, the person goes straight back to sign in with a clear note.
 */
export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [expired, setExpired] = useState(false);
  const signedIn = useRef(false);
  signedIn.current = authenticated;

  useEffect(() => {
    let active = true;
    apiRequest<SessionUser>('/auth/me')
      .then(() => { if (active) setAuthenticated(true); })
      .catch(() => { if (active) setAuthenticated(false); });
    const onExpired = () => { if (signedIn.current) { setAuthenticated(false); setExpired(true); } };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => { active = false; window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired); };
  }, []);

  if (authenticated) return <DashboardApp onLogout={() => setAuthenticated(false)} />;
  if (expired) return <LoginScreen notice={SESSION_EXPIRED_MESSAGE} onReady={() => { setExpired(false); setAuthenticated(true); }} />;
  return <PublicSite onReady={() => setAuthenticated(true)} />;
}
