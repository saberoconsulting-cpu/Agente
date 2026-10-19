'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Brain, CalendarClock, KeyRound, Link2, LogOut, Menu, Settings2, Target, X } from 'lucide-react';
import { apiRequest, clearToken, SessionUser } from '@/lib/api';
import type { AgentSettings, DashboardSummary, DriveFile, Opportunity, OpportunityFollowupDraft } from '@/lib/types';
import { Brand } from '@/components/brand';
import { Button, StatusPill } from '@/components/ui';
import { Access, AgentConfig, Analytics, Knowledge, Links, Opportunities, Overview } from '@/features/dashboard/views';

const views = [
  ['overview', 'Centro de mando', Bot],
  ['analytics', 'Analitica', BarChart3],
  ['opportunities', 'Oportunidades', Target],
  ['links', 'Gestion y vinculacion', Link2],
  ['knowledge', 'Conocimiento', Brain],
  ['agent', 'Agente comercial', Settings2],
  ['access', 'Accesos', KeyRound],
] as const;

export function DashboardApp({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<(typeof views)[number][0]>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [followupDrafts, setFollowupDrafts] = useState<OpportunityFollowupDraft[]>([]);
  const companyId = user?.company_id || 'sabero';

  const pushLog = useCallback((message: string) => {
    setLog((items) => [`${new Date().toLocaleTimeString()}  ${message}`, ...items].slice(0, 12));
  }, []);

  const loadSummary = useCallback(async () => {
    setSummary(await apiRequest<DashboardSummary>('/dashboard/summary'));
  }, []);

  const loadSettings = useCallback(async (id = companyId) => {
    setSettings(await apiRequest<AgentSettings>(`/agent-settings?company_id=${id}`));
  }, [companyId]);

  const loadFiles = useCallback(async (id = companyId) => {
    setFiles(await apiRequest<DriveFile[]>(`/google-drive/files?company_id=${id}`));
  }, [companyId]);

  const loadUsers = useCallback(async (id = companyId) => {
    setUsers(await apiRequest<SessionUser[]>(`/auth/users?company_id=${id}`));
  }, [companyId]);

  const loadOpportunities = useCallback(async () => {
    setOpportunities(await apiRequest<Opportunity[]>('/opportunities'));
  }, []);

  const loadFollowupDrafts = useCallback(async () => {
    setFollowupDrafts(await apiRequest<OpportunityFollowupDraft[]>('/opportunities/followup-drafts?status=pending'));
  }, []);

  const bootstrap = useCallback(async () => {
    const current = await apiRequest<SessionUser>('/auth/me');
    setUser(current);
    await Promise.all([
      loadSummary(),
      loadSettings(current.company_id),
      loadFiles(current.company_id),
      loadUsers(current.company_id),
      loadOpportunities(),
      loadFollowupDrafts(),
    ]);
  }, [loadSummary, loadSettings, loadFiles, loadUsers, loadOpportunities, loadFollowupDrafts]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    if (!googleStatus) return;
    pushLog(googleStatus === 'connected' ? 'Google conectado correctamente. Tokens guardados cifrados.' : `Google no pudo conectarse: ${params.get('reason') || 'error desconocido'}.`);
    setView('links');
    window.history.replaceState({}, '', window.location.pathname);
  }, [pushLog]);

  const reloadCommercial = useCallback(async () => {
    await Promise.all([loadSummary(), loadOpportunities(), loadFollowupDrafts()]);
  }, [loadSummary, loadOpportunities, loadFollowupDrafts]);

  const signOut = useCallback(async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
    onLogout();
  }, [onLogout]);

  const activeTitle = useMemo(() => views.find(([key]) => key === view)?.[1], [view]);
  const canOperate = Boolean(user && ['owner', 'admin'].includes(user.role));

  return (
    <main className="min-h-screen bg-sabero-mist">
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-sabero-ink/60 backdrop-blur-sm xl:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 overflow-y-auto bg-sabero-navy p-4 text-white shadow-enterprise transition-transform duration-300 xl:p-6 xl:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <Brand dark logoOnly />
          <button
            type="button"
            aria-label="Cerrar menu"
            onClick={() => setMenuOpen(false)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-blue-100 transition hover:bg-white/10 xl:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="mt-10 grid gap-2">
          {views.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => {
                setView(key);
                setMenuOpen(false);
              }}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${view === key ? 'bg-sabero-electric text-white shadow-neon' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <section className="xl:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/86 px-5 py-4 backdrop-blur xl:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMenuOpen(true)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-sabero-navy transition hover:border-sabero-electric hover:text-sabero-electric xl:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-sabero-crimson">SaaS multiempresa</p>
                <h1 className="text-3xl font-black tracking-[-0.04em] text-sabero-navy">{activeTitle}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill
                active={Boolean(summary?.integrations.google_connected)}
                label={summary?.integrations.google_connected ? 'Google conectado' : 'Google pendiente'}
              />
              <Button variant="ghost" onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}>
                <CalendarClock className="mr-2 h-4 w-4" />Calendar
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" />Salir
              </Button>
            </div>
          </div>
        </header>
        <div className="grid gap-6 p-5 xl:p-10">
          {view === 'overview' && <Overview summary={summary} log={log} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} />}
          {view === 'analytics' && <Analytics summary={summary} opportunities={opportunities} />}
          {view === 'knowledge' && <Knowledge companyId={companyId} files={files} reload={loadFiles} pushLog={pushLog} />}
          {view === 'agent' && <AgentConfig companyId={companyId} settings={settings} reload={loadSettings} pushLog={pushLog} />}
          {view === 'links' && <Links companyId={companyId} reload={reloadCommercial} pushLog={pushLog} />}
          {view === 'opportunities' && (
            <Opportunities items={opportunities} users={users} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} />
          )}
          {view === 'access' && <Access users={users} companyId={companyId} reload={loadUsers} pushLog={pushLog} />}
        </div>
      </section>
    </main>
  );
}
