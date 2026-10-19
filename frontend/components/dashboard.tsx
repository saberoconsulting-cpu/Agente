'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Brain, CalendarClock, KeyRound, Link2, LogOut, Settings2, Target } from 'lucide-react';
import { apiRequest, clearToken, SessionUser } from '../lib/api';
import type { AgentSettings, DashboardSummary, DriveFile, Opportunity, OpportunityFollowupDraft } from '../lib/types';
import { Brand } from './brand';
import { Button, StatusPill } from './ui';
import { Access, AgentConfig, Knowledge, Links, Opportunities, Overview } from '../features/dashboard/views';

const views = [
  ['overview', 'Centro de mando', Bot], ['opportunities', 'Oportunidades', Target],
  ['links', 'Gestion y vinculacion', Link2], ['knowledge', 'Conocimiento', Brain],
  ['agent', 'Agente comercial', Settings2], ['access', 'Accesos', KeyRound],
] as const;

export function DashboardApp({ onLogout }: { onLogout: () => void }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [view, setView] = useState<(typeof views)[number][0]>('overview');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [followupDrafts, setFollowupDrafts] = useState<OpportunityFollowupDraft[]>([]);
  const companyId = user?.company_id || 'sabero';

  useEffect(() => { void bootstrap(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');
    if (!googleStatus) return;
    pushLog(googleStatus === 'connected' ? 'Google conectado correctamente. Tokens guardados cifrados.' : `Google no pudo conectarse: ${params.get('reason') || 'error desconocido'}.`);
    setView('links'); window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function bootstrap() {
    const current = await apiRequest<SessionUser>('/auth/me'); setUser(current);
    await Promise.all([loadSummary(), loadSettings(current.company_id), loadFiles(current.company_id), loadUsers(current.company_id), loadOpportunities(), loadFollowupDrafts()]);
  }
  async function loadSummary() { setSummary(await apiRequest<DashboardSummary>('/dashboard/summary')); }
  async function loadSettings(id = companyId) { setSettings(await apiRequest<AgentSettings>(`/agent-settings?company_id=${id}`)); }
  async function loadFiles(id = companyId) { setFiles(await apiRequest<DriveFile[]>(`/google-drive/files?company_id=${id}`)); }
  async function loadUsers(id = companyId) { setUsers(await apiRequest<SessionUser[]>(`/auth/users?company_id=${id}`)); }
  async function loadOpportunities() { setOpportunities(await apiRequest<Opportunity[]>('/opportunities')); }
  async function loadFollowupDrafts() { setFollowupDrafts(await apiRequest<OpportunityFollowupDraft[]>('/opportunities/followup-drafts?status=pending')); }
  async function reloadCommercial() { await Promise.all([loadSummary(), loadOpportunities(), loadFollowupDrafts()]); }
  function pushLog(message: string) { setLog((items) => [`${new Date().toLocaleTimeString()}  ${message}`, ...items].slice(0, 12)); }
  async function signOut() { try { await apiRequest('/auth/logout', { method: 'POST' }); } finally { clearToken(); } onLogout(); }
  const activeTitle = useMemo(() => views.find(([key]) => key === view)?.[1], [view]);
  const canOperate = Boolean(user && ['owner', 'admin'].includes(user.role));

  return <main className="min-h-screen bg-sabero-mist"><aside className="fixed inset-y-0 left-0 hidden w-80 bg-sabero-navy p-6 text-white shadow-enterprise xl:block"><Brand dark /><div className="mt-10 rounded-[26px] border border-white/10 bg-white/8 p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-cyan">Beta activa</p><h2 className="mt-3 text-2xl font-black leading-tight">SABERO Consulting</h2><p className="mt-3 text-sm leading-6 text-blue-100">Agente entrenado para vender software a medida, cloud e IA aplicada.</p></div><nav className="mt-8 grid gap-2">{views.map(([key, label, Icon]) => <button key={key} onClick={() => setView(key)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${view === key ? 'bg-sabero-electric text-white shadow-neon' : 'text-blue-100 hover:bg-white/10'}`}><Icon className="h-5 w-5" />{label}</button>)}</nav></aside><section className="xl:pl-80"><header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/86 px-5 py-4 backdrop-blur xl:px-10"><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.24em] text-sabero-crimson">SaaS multiempresa</p><h1 className="text-3xl font-black tracking-[-0.04em] text-sabero-navy">{activeTitle}</h1></div><div className="flex items-center gap-3"><StatusPill active={Boolean(summary?.integrations.google_connected)} label={summary?.integrations.google_connected ? 'Google conectado' : 'Google pendiente'} /><Button variant="ghost" onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}><CalendarClock className="mr-2 h-4 w-4" />Calendar</Button><Button variant="ghost" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Salir</Button></div></div></header><div className="grid gap-6 p-5 xl:p-10">{view === 'overview' && <Overview summary={summary} log={log} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} />}{view === 'opportunities' && <Opportunities items={opportunities} users={users} drafts={followupDrafts} canOperate={canOperate} reload={reloadCommercial} />}{view === 'links' && <Links companyId={companyId} pushLog={pushLog} reload={loadSummary} />}{view === 'knowledge' && <Knowledge companyId={companyId} files={files} reload={loadFiles} pushLog={pushLog} />}{view === 'agent' && <AgentConfig companyId={companyId} settings={settings} reload={loadSettings} pushLog={pushLog} />}{view === 'access' && <Access companyId={companyId} users={users} reload={loadUsers} pushLog={pushLog} />}</div></section></main>;
}
