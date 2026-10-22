'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Bot, Brain, Building2, CalendarClock, KeyRound, Link2, LogOut, Menu, Settings2, Target, Users, Gauge, RefreshCw, X } from 'lucide-react';
import { Companies } from '@/features/dashboard/companies';
import { RecordPermissions } from '@/components/list-controls';
import { AccessRequests } from '@/features/dashboard/access-requests';
import { LegalLinks } from '@/components/legal-links';
import Script from 'next/script';
import { Contacts } from '@/features/dashboard/contacts';
import { Usage } from '@/features/dashboard/usage';
import { apiRequest, clearToken, SessionUser } from '@/lib/api';
import type { AgentSettings, DashboardSummary, DriveFile, Opportunity, OpportunityFollowupDraft } from '@/lib/types';
import { Button, StatusPill } from '@/components/ui';
import { Access, AgentConfig, Analytics, Knowledge, Links, Opportunities, Overview } from '@/features/dashboard/views';

const views = [
  ['companies', 'Empresas · SABERO', Building2],
  ['requests', 'Solicitudes de acceso', Users],
  ['overview', 'Inicio', Bot],
  ['contacts', 'Contactos', Users],
  ['opportunities', 'Oportunidades', Target],
  ['analytics', 'Resultados', BarChart3],
  ['usage', 'Consumo de IA', Gauge],
  ['links', 'Conexiones', Link2],
  ['knowledge', 'Conocimiento', Brain],
  ['agent', 'Agente comercial', Settings2],
  ['access', 'Accesos', KeyRound],
] as const;

export function DashboardApp({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<(typeof views)[number][0]>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [platformAdmin, setPlatformAdmin] = useState(false);
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
    const results = await Promise.allSettled([
      loadSummary(),
      loadSettings(current.company_id),
      loadFiles(current.company_id),
      loadUsers(current.company_id),
      loadOpportunities(),
      loadFollowupDrafts(),
    ]);
    if (results.some(result => result.status === 'rejected')) throw new Error('Algunos datos no se pudieron cargar. Actualiza para volver a intentarlo.');
  }, [loadSummary, loadSettings, loadFiles, loadUsers, loadOpportunities, loadFollowupDrafts]);

  useEffect(() => {
    void bootstrap().catch(reason => setError(reason instanceof Error ? reason.message : 'No se pudo cargar el panel.'));
  }, [bootstrap]);

  useEffect(() => {
    void apiRequest<{ platform_admin: boolean }>('/platform/capabilities').then(capabilities => {
      setPlatformAdmin(capabilities.platform_admin);
      if (capabilities.platform_admin) setView(current=>current==='overview'?'companies':current);
    }).catch(() => setPlatformAdmin(false));
  }, []);

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

  const refresh = async () => {
    setLoading(true); setError('');
    try { await bootstrap(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar.'); }
    finally { setLoading(false); }
  };

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
    <RecordPermissions.Provider value={user}><main className="min-h-screen bg-sabero-mist">
      {menuOpen && (
        <button
          type="button"
          aria-label="Cerrar menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-30 bg-sabero-ink/60 backdrop-blur-sm xl:hidden"
        />
      )}
      <aside
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col overflow-hidden bg-sabero-navy p-4 text-white shadow-enterprise transition-[width,transform] duration-200 motion-reduce:transition-none xl:translate-x-0 ${sidebarCollapsed ? 'xl:w-20' : 'xl:w-64'} ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className={`flex items-center gap-3 py-3 ${sidebarCollapsed ? 'xl:hidden' : ''}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sabero-electric"><Bot className="h-6 w-6" /></span><div><p className="text-lg font-bold tracking-wide">SABERO AI</p><p className="text-xs text-blue-200">Agente de ventas</p></div></div>
          <button type="button" aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!sidebarCollapsed} aria-controls="dashboard-navigation" title={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'} onClick={() => setSidebarCollapsed(value => !value)} className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl text-blue-100 hover:bg-white/10 xl:grid"><Menu className="h-5 w-5" /></button>
          <button
            type="button"
            aria-label="Cerrar menu"
            onClick={() => setMenuOpen(false)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-blue-100 transition hover:bg-white/10 xl:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav id="dashboard-navigation" className="dashboard-navigation mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
          {views.filter(([key]) => !['companies','requests'].includes(key) || platformAdmin).map(([key, label, Icon]) => (
            <div key={key} className={sidebarCollapsed ? 'xl:[&>p]:hidden' : ''}>
            {key === 'companies' && <p className="mb-3 px-4 text-xs font-semibold uppercase tracking-wider text-blue-200/70">Administración</p>}
            {key === 'overview' && platformAdmin && <p className="mb-3 mt-5 px-4 text-xs font-semibold uppercase tracking-wider text-blue-200/70">Mi empresa</p>}
            {key === 'links' && <p className="mb-3 mt-5 px-4 text-xs font-semibold uppercase tracking-wider text-blue-200/70">Configuración</p>}
            <button
              key={key}
              aria-label={label}
              aria-current={view === key ? 'page' : undefined}
              title={sidebarCollapsed ? label : undefined}
              onClick={() => {
                setView(key);
                setMenuOpen(false);
              }}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition-colors ${sidebarCollapsed ? 'xl:justify-center xl:px-0' : ''} ${view === key ? 'bg-sabero-electric text-white' : 'text-blue-100 hover:bg-white/10'}`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={sidebarCollapsed ? 'xl:hidden' : ''}>{label}</span>
            </button>
            </div>
          ))}
        </nav>
        <button type="button" onClick={()=>void signOut()} title="Cerrar sesión" aria-label="Cerrar sesión" className={`mt-4 flex min-h-11 shrink-0 items-center gap-3 rounded-xl border-t border-white/10 px-4 text-sm text-blue-200 hover:bg-white/10 ${sidebarCollapsed?'xl:justify-center xl:px-0':''}`}><LogOut className="h-5 w-5 shrink-0"/><span className={sidebarCollapsed?'xl:hidden':''}>Cerrar sesión</span></button>
      </aside>
      <section className={`transition-[padding] duration-200 motion-reduce:transition-none ${sidebarCollapsed ? 'xl:pl-20' : 'xl:pl-64'}`}>
        <header className={`sticky top-0 z-20 border-b border-slate-200/70 bg-white/86 px-5 py-4 backdrop-blur xl:px-10 ${['companies','overview'].includes(view)?'xl:hidden':''}`}>
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
              {!['companies','overview'].includes(view)&&<div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{['companies','requests'].includes(view) ? 'Administración de la plataforma' : `${user?.company_id || 'Mi empresa'} · Tu negocio`}</p>
                <h1 className="text-2xl font-black tracking-[-0.04em] text-sabero-navy sm:text-3xl">{activeTitle}</h1>
              </div>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!['companies','overview'].includes(view)&&<Button variant="ghost" onClick={() => void refresh()} disabled={loading} aria-label="Actualizar panel"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>}
              {!['companies', 'requests','overview'].includes(view) && <StatusPill
                active={Boolean(summary?.integrations.google_connected)}
                label={!summary ? 'Cargando Google…' : summary.integrations.google_connected ? 'Google conectado' : 'Google sin vincular'}
              />}
              {!['companies', 'requests','overview'].includes(view) && settings?.settings.scheduling_enabled && <Button variant="ghost" onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}>
                <CalendarClock className="mr-2 h-4 w-4" />Calendar
              </Button>}
            </div>
          </div>
        </header>
        <div className="grid min-w-0 gap-6 p-5 xl:p-10">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
          {view === 'companies' && platformAdmin && <Companies adminCompanyId={companyId} />}
          {view === 'requests' && platformAdmin && <AccessRequests adminCompanyId={companyId} />}
          {view === 'contacts' && <Contacts />}
          {view === 'usage' && <Usage />}
          {view === 'overview' && <Overview summary={summary} settings={settings} user={user} opportunities={opportunities} log={log} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} navigate={setView} />}
          {view === 'analytics' && <Analytics summary={summary} opportunities={opportunities} />}
          {view === 'knowledge' && <Knowledge companyId={companyId} files={files} reload={loadFiles} pushLog={pushLog} />}
          {view === 'agent' && <AgentConfig companyId={companyId} settings={settings} reload={loadSettings} pushLog={pushLog} />}
          {view === 'links' && <Links companyId={companyId} reload={reloadCommercial} pushLog={pushLog} />}
          {view === 'opportunities' && (
            <Opportunities items={opportunities} users={users} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} />
          )}
          {view === 'access' && <Access users={users} companyId={companyId} reload={loadUsers} pushLog={pushLog} />}
        </div>
        <footer className="px-5 pb-8"><LegalLinks /></footer>
      </section>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
    </main></RecordPermissions.Provider>
  );
}
