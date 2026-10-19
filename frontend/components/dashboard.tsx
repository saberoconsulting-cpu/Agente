'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Brain,
  CalendarClock,
  CheckCircle2,
  Cloud,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
  Zap,
  Target,
} from 'lucide-react';
import { apiRequest, clearToken, SessionUser } from '../lib/api';
import type { AgentSettings, DashboardSummary, DriveFile, Meeting, Opportunity, OpportunityFollowupDraft } from '../lib/types';
import { Brand } from './brand';
import { Button, Panel, StatusPill } from './ui';

type PickerConfig = {
  company_id: string;
  client_id: string | null;
  developer_key: string | null;
  app_id: string | null;
  scopes: string[];
  enabled: boolean;
};

type TokenClient = {
  requestAccessToken: (options: { prompt: string }) => void;
};

type PickerDocument = {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
};

declare global {
  interface Window {
    FB?: {
      init: (options: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
    google?: any;
    gapi?: any;
  }
}

type FacebookLoginResponse = {
  authResponse?: {
    code?: string;
  };
  status?: string;
};

type WhatsAppEmbeddedSignupConfig = {
  app_id: string;
  config_id: string | null;
  graph_api_version: string;
  enabled: boolean;
  missing: string[];
};

type WhatsAppConnection = {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
};

type WhatsAppSignupAssets = {
  waba_id?: string;
  phone_number_id?: string;
};

const views = [
  ['overview', 'Centro de mando', Bot],
  ['opportunities', 'Oportunidades', Target],
  ['links', 'Gestion y vinculacion', Link2],
  ['knowledge', 'Conocimiento', Brain],
  ['agent', 'Agente comercial', Settings2],
  ['access', 'Accesos', KeyRound],
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

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleStatus = params.get('google');

    if (googleStatus === 'connected') {
      pushLog('Google conectado correctamente. Tokens guardados cifrados.');
      setView('links');
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (googleStatus === 'error') {
      pushLog(`Google no pudo conectarse: ${params.get('reason') || 'error desconocido'}.`);
      setView('links');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function bootstrap() {
    const current = await apiRequest<SessionUser>('/auth/me');
    setUser(current);
    await Promise.all([loadSummary(current.company_id), loadSettings(current.company_id), loadFiles(current.company_id), loadUsers(current.company_id), loadOpportunities(), loadFollowupDrafts()]);
  }

  async function loadSummary(id = companyId) {
    setSummary(await apiRequest<DashboardSummary>(`/dashboard/summary?company_id=${id}`));
  }

  async function loadSettings(id = companyId) {
    setSettings(await apiRequest<AgentSettings>(`/agent-settings?company_id=${id}`));
  }

  async function loadFiles(id = companyId) {
    setFiles(await apiRequest<DriveFile[]>(`/google-drive/files?company_id=${id}`));
  }

  async function loadUsers(id = companyId) {
    setUsers(await apiRequest<SessionUser[]>(`/auth/users?company_id=${id}`));
  }
  async function loadOpportunities() { setOpportunities(await apiRequest<Opportunity[]>('/opportunities')); }
  async function loadFollowupDrafts() { setFollowupDrafts(await apiRequest<OpportunityFollowupDraft[]>('/opportunities/followup-drafts?status=pending')); }
  async function reloadCommercial() { await Promise.all([loadSummary(), loadOpportunities(), loadFollowupDrafts()]); }

  function pushLog(message: string) {
    setLog((items) => [`${new Date().toLocaleTimeString()}  ${message}`, ...items].slice(0, 12));
  }

  async function signOut() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
    onLogout();
  }

  const activeTitle = useMemo(() => views.find(([key]) => key === view)?.[1], [view]);

  return (
    <main className="min-h-screen bg-sabero-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-80 bg-sabero-navy p-6 text-white shadow-enterprise xl:block">
        <Brand dark />
        <div className="mt-10 rounded-[26px] border border-white/10 bg-white/8 p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-cyan">Beta activa</p>
          <h2 className="mt-3 text-2xl font-black leading-tight">SABERO Consulting</h2>
          <p className="mt-3 text-sm leading-6 text-blue-100">
            Agente entrenado para vender software a medida, cloud e IA aplicada.
          </p>
        </div>
        <nav className="mt-8 grid gap-2">
          {views.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                view === key ? 'bg-sabero-electric text-white shadow-neon' : 'text-blue-100 hover:bg-white/10'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="xl:pl-80">
        <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/86 px-5 py-4 backdrop-blur xl:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-sabero-crimson">SaaS multiempresa</p>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-sabero-navy">{activeTitle}</h1>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill active={Boolean(summary?.integrations.google_connected)} label={summary?.integrations.google_connected ? 'Google conectado' : 'Google pendiente'} />
              <Button
                variant="ghost"
                onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}
              >
                <CalendarClock className="mr-2 h-4 w-4" />Calendar
              </Button>
              <Button variant="ghost" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Salir</Button>
            </div>
          </div>
        </header>

        <div className="grid gap-6 p-5 xl:p-10">
          {view === 'overview' && <Overview summary={summary} log={log} drafts={followupDrafts} canOperate={Boolean(user && ['owner', 'admin'].includes(user.role))} reload={reloadCommercial} />}
          {view === 'opportunities' && <Opportunities items={opportunities} users={users} drafts={followupDrafts} canOperate={Boolean(user && ['owner', 'admin'].includes(user.role))} reload={reloadCommercial} />}
          {view === 'links' && <Links companyId={companyId} pushLog={pushLog} reload={() => loadSummary()} />}
          {view === 'knowledge' && <Knowledge companyId={companyId} files={files} reload={loadFiles} pushLog={pushLog} />}
          {view === 'agent' && <AgentConfig companyId={companyId} settings={settings} reload={loadSettings} pushLog={pushLog} />}
          {view === 'access' && <Access companyId={companyId} users={users} reload={loadUsers} pushLog={pushLog} />}
        </div>
      </section>
    </main>
  );
}

function Overview({ summary, log, drafts, canOperate, reload }: { summary: DashboardSummary | null; log: string[]; drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void> }) {
  const metrics = [
    ['Leads', summary?.metrics.leads ?? 0, Users],
    ['Conversaciones', summary?.metrics.conversations ?? 0, MessageCircle],
    ['Documentos RAG', summary?.metrics.indexed_documents ?? 0, FileText],
    ['Reuniones', summary?.metrics.upcoming_meetings ?? 0, CalendarClock],
  ] as const;
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        {metrics.map(([label, value, Icon]) => (
          <Panel key={label} className="relative overflow-hidden">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[44px] bg-sabero-electric/10" />
            <Icon className="h-6 w-6 text-sabero-electric" />
            <p className="mt-5 text-sm font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <strong className="mt-2 block text-4xl font-black text-sabero-navy">{value}</strong>
          </Panel>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Panel className="bg-sabero-navy text-white">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-cyan">Motor comercial</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.04em]">Vendedor IA hiperadaptativo para cualquier negocio.</h2>
          <p className="mt-5 max-w-3xl text-blue-100">
            Hoy opera en beta para SABERO Consulting: califica prospectos de software, arquitectura cloud y automatizaciones IA; mañana cada empresa conecta su Drive, WhatsApp y reglas comerciales.
          </p>
          <div className="mt-7 grid gap-3 md:grid-cols-3">
            {['Argumenta beneficios', 'Maneja objeciones', 'Agenda reuniones'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/8 p-4 font-bold">{item}</div>
            ))}
          </div>
        </Panel>
        <Panel>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Registro ejecutivo</p>
          <div className="mt-4 grid gap-3">
            {(log.length ? log : ['Panel listo para operar.', 'Google Picker y Docker habilitados.']).map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">{item}</div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Rendimiento comercial</p><h2 className="mt-2 text-2xl font-black text-sabero-navy">Mes actual</h2></div><StatusPill active={Boolean(summary?.sales?.pending_drafts)} label={`${summary?.sales?.pending_drafts || 0} por aprobar`} /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{[['Creadas', summary?.sales?.created || 0], ['Calificadas', summary?.sales?.qualified || 0], ['Reuniones', summary?.sales?.meetings || 0], ['Propuestas', summary?.sales?.proposals || 0], ['Ganadas', summary?.sales?.won || 0], ['Perdidas', summary?.sales?.lost || 0]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-500">{label}</p><strong className="mt-2 block text-2xl text-sabero-navy">{value}</strong></div>)}</div>
        <div className="mt-5 grid gap-3 md:grid-cols-2"><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Valor en pipeline</p><strong className="mt-2 block text-2xl text-sabero-navy">{formatMoney(summary?.sales?.pipeline_value || 0)}</strong></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-black uppercase text-slate-500">Valor ganado</p><strong className="mt-2 block text-2xl text-emerald-700">{formatMoney(summary?.sales?.won_value || 0)}</strong></div></div>
        <div className="mt-5 flex flex-wrap gap-3">{[['Calificación', summary?.sales?.conversion.qualified || 0], ['Reunión', summary?.sales?.conversion.meetings || 0], ['Propuesta', summary?.sales?.conversion.proposals || 0], ['Cierre', summary?.sales?.conversion.won || 0]].map(([label, value]) => <StatusPill key={String(label)} active={Number(value) > 0} label={`${label} ${value}%`} />)}</div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><Breakdown title="Por responsable" rows={summary?.sales?.by_assignee || []} /><Breakdown title="Por servicio" rows={summary?.sales?.by_service || []} /></div>
      </Panel>
      <DraftInbox drafts={drafts} canOperate={canOperate} reload={reload} />
    </>
  );
}

function Opportunities({ items, users, drafts, canOperate, reload }: { items: Opportunity[]; users: SessionUser[]; drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void> }) {
  const stages = [['nuevo', 'Nuevas'], ['calificado', 'Calificadas'], ['reunion_propuesta', 'Reunión'], ['reunion_agendada', 'Agendadas'], ['propuesta', 'Propuestas'], ['ganado', 'Ganadas']] as const;
  async function move(id: string, stage: string) { await apiRequest(`/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }); await reload(); }
  async function handoff(id: string, assigneeId: string) { if (!assigneeId) return; await apiRequest(`/opportunities/${id}/handoff`, { method: 'POST', body: JSON.stringify({ assignee_id: assigneeId }) }); await reload(); }
  async function proposal(id: string) { await apiRequest(`/opportunities/${id}/proposals`, { method: 'POST' }); await reload(); }
  const sellers = users.filter((item) => item.active !== false && ['owner', 'admin'].includes(item.role));
  return <div className="grid gap-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.22em] text-sabero-crimson">Embudo comercial</p><h2 className="mt-2 text-3xl font-black text-sabero-navy">Oportunidades</h2></div><Button variant="ghost" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div><DraftInbox drafts={drafts} canOperate={canOperate} reload={reload} compact /><div className="grid gap-4 xl:grid-cols-3">{stages.map(([stage, label]) => <Panel key={stage}><h3 className="font-black text-sabero-navy">{label}</h3><div className="mt-4 grid gap-3">{items.filter((item) => item.stage === stage).map((item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-black text-sabero-navy">{item.lead_name || item.whatsapp_number}</p><p className="mt-1 text-xs font-bold text-slate-500">Score {item.score} · {item.assignee_email || 'Sin asignar'}</p>{item.score >= 60 && !item.assignee_email && <select aria-label="Asignar vendedor" defaultValue="" onChange={(event) => void handoff(item.id, event.target.value)} className="mt-3 min-h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-sabero-navy"><option value="">Derivar a vendedor…</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.email}</option>)}</select>}<div className="mt-3 flex flex-wrap gap-2">{stage === 'nuevo' && <Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'calificado')}>Confirmar</Button>}{stage === 'calificado' && <><Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'reunion_propuesta')}>Proponer reunión</Button><Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => void proposal(item.id)}>Crear propuesta</Button></>}{stage === 'propuesta' && <Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'ganado')}>Marcar ganada</Button>}</div></div>)}</div></Panel>)}</div></div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; count: number; value: string }> }) { return <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-500">{title}</p><div className="mt-3 grid gap-2">{rows.length ? rows.map((row) => <div key={row.label} className="flex justify-between gap-3 text-sm"><span className="font-bold text-sabero-navy">{row.label}</span><span className="text-slate-500">{row.count} · {formatMoney(Number(row.value))}</span></div>) : <p className="text-sm text-slate-500">Sin datos todavía.</p>}</div></div>; }

function DraftInbox({ drafts, canOperate, reload, compact = false }: { drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void>; compact?: boolean }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  async function approve(draft: OpportunityFollowupDraft) { const template = window.prompt('Nombre de plantilla aprobada (déjalo vacío si estás dentro de la ventana de 24 h):', draft.template_name || '') || undefined; await apiRequest(`/opportunities/followup-drafts/${draft.id}/approve`, { method: 'POST', body: JSON.stringify({ message: edits[draft.id] || draft.message, template_name: template }) }); await reload(); }
  async function reject(draft: OpportunityFollowupDraft) { const reason = window.prompt('Motivo para descartar el seguimiento:', ''); await apiRequest(`/opportunities/followup-drafts/${draft.id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || undefined }) }); await reload(); }
  return <Panel className={compact ? 'p-5' : undefined}><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-sabero-crimson">Seguimientos por aprobar</p><h2 className="mt-2 text-xl font-black text-sabero-navy">{drafts.length} pendientes</h2></div><StatusPill active={drafts.length > 0} label={drafts.length ? 'Acción requerida' : 'Al día'} /></div><div className="mt-4 grid gap-3">{drafts.length ? drafts.map((draft) => <div key={draft.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-black text-sabero-navy">{draft.lead_name || draft.whatsapp_number}</p><StatusPill active={draft.priority === 'high'} label={draft.priority === 'high' ? 'Alta prioridad' : 'Normal'} /></div><p className="mt-1 text-xs font-bold text-slate-500">{draft.rule_key.replaceAll('_', ' ')} · {draft.assignee_email || 'Sin responsable'}</p>{canOperate ? <><textarea aria-label={`Mensaje para ${draft.lead_name || draft.whatsapp_number}`} value={edits[draft.id] ?? draft.message} onChange={(event) => setEdits((current) => ({ ...current, [draft.id]: event.target.value }))} className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700" /><div className="mt-3 flex flex-wrap gap-2"><Button className="min-h-9 px-3 text-xs" onClick={() => void approve(draft)}>Aprobar y enviar</Button><Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => void reject(draft)}>Descartar</Button></div></> : <p className="mt-3 text-sm text-slate-600">{draft.message}</p>}</div>) : <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No hay seguimientos pendientes.</p>}</div></Panel>;
}

function formatMoney(value: number) { return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(value); }

function Links({ companyId, pushLog, reload }: { companyId: string; pushLog: (m: string) => void; reload: () => void }) {
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppEmbeddedSignupConfig | null>(null);
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsAppConnection[]>([]);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState('Pendiente de configuracion');
  const pendingCodeRef = useRef<string | null>(null);
  const pendingAssetsRef = useRef<WhatsAppSignupAssets>({});
  const completingRef = useRef(false);

  useEffect(() => {
    void loadWhatsAppState();
  }, []);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const payload = parseWhatsAppSignupMessage(event);
      if (!payload) return;

      if (payload.status === 'FINISH' || payload.event === 'FINISH') {
        pendingAssetsRef.current = {
          waba_id: payload.waba_id,
          phone_number_id: payload.phone_number_id,
        };
        setWhatsappStatus('Autorizacion recibida. Guardando conexion...');
        void completeWhatsAppSignup();
        return;
      }

      if (payload.status === 'CANCEL' || payload.event === 'CANCEL') {
        setWhatsappBusy(false);
        setWhatsappStatus('Conexion cancelada por el usuario.');
        pushLog('WhatsApp Embedded Signup cancelado.');
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  const items = [
    ['WhatsApp Cloud API', 'Webhook, respuestas y seguimiento comercial.', Boolean(whatsappConnections.length), MessageCircle],
    ['Google Drive', 'Fuente de conocimiento empresarial con Picker.', true, Cloud],
    ['Google Calendar', 'Agenda reuniones sin conflictos de horario.', true, CalendarClock],
    ['CRM API', 'Integracion opcional sin duplicar logica del agente.', false, Zap],
  ] as const;

  async function loadWhatsAppState() {
    const [config, connections] = await Promise.all([
      apiRequest<WhatsAppEmbeddedSignupConfig>('/whatsapp/connections/embedded-signup/config'),
      apiRequest<WhatsAppConnection[]>('/whatsapp/connections'),
    ]);
    setWhatsappConfig(config);
    setWhatsappConnections(connections);
    if (connections.length) {
      setWhatsappStatus('WhatsApp conectado.');
    } else if (!config.enabled) {
      setWhatsappStatus(`Falta configurar: ${config.missing.join(', ') || 'configuracion Meta'}.`);
    } else {
      setWhatsappStatus('Listo para conectar WhatsApp.');
    }
  }

  async function connectWhatsApp() {
    if (!whatsappConfig?.enabled || !whatsappConfig.config_id) {
      pushLog('WhatsApp Embedded Signup pendiente: falta config_id real de Meta.');
      return;
    }

    setWhatsappBusy(true);
    setWhatsappStatus('Abriendo Meta...');
    pendingCodeRef.current = null;
    pendingAssetsRef.current = {};
    completingRef.current = false;

    try {
      await loadFacebookSdk(whatsappConfig.app_id, whatsappConfig.graph_api_version);
      window.FB?.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setWhatsappBusy(false);
          setWhatsappStatus(response.status === 'not_authorized' ? 'Meta no autorizo la conexion.' : 'Conexion cancelada o incompleta.');
          pushLog('WhatsApp no entrego codigo de autorizacion.');
          return;
        }

        pendingCodeRef.current = code;
        setWhatsappStatus('Codigo recibido. Esperando datos del numero...');
        void completeWhatsAppSignup();
      }, {
        config_id: whatsappConfig.config_id,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: 3,
        },
      });
    } catch (error) {
      setWhatsappBusy(false);
      setWhatsappStatus(error instanceof Error ? error.message : 'No se pudo iniciar Meta.');
    }
  }

  async function completeWhatsAppSignup() {
    const code = pendingCodeRef.current;
    const assets = pendingAssetsRef.current;
    if (completingRef.current || !code || !assets.waba_id || !assets.phone_number_id) return;

    completingRef.current = true;
    try {
      const connection = await apiRequest<WhatsAppConnection>('/whatsapp/connections/embedded-signup/complete', {
        method: 'POST',
        body: JSON.stringify({
          code,
          waba_id: assets.waba_id,
          phone_number_id: assets.phone_number_id,
        }),
      });
      setWhatsappConnections([connection]);
      setWhatsappStatus('WhatsApp conectado correctamente.');
      pushLog('WhatsApp conectado y token guardado cifrado.');
      reload();
    } catch (error) {
      setWhatsappStatus(error instanceof Error ? error.message : 'No se pudo completar WhatsApp.');
      pushLog('WhatsApp no pudo completar la conexion.');
    } finally {
      setWhatsappBusy(false);
      completingRef.current = false;
      pendingCodeRef.current = null;
      pendingAssetsRef.current = {};
    }
  }

  return (
    <div className="grid gap-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Vinculaciones</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy">Canales del agente</h2>
          </div>
          <Button onClick={() => { pushLog('Estado de vinculaciones actualizado.'); reload(); }}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map(([name, description, active, Icon]) => (
          <Panel key={name} className="flex items-start justify-between gap-5">
            <div className="flex gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sabero-navy text-white"><Icon className="h-6 w-6" /></div>
              <div>
                <h3 className="text-xl font-black text-sabero-navy">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            </div>
            <StatusPill active={active} />
          </Panel>
        ))}
      </div>
      <Panel>
        <div className="flex flex-wrap gap-3">
          <Button onClick={connectWhatsApp} disabled={whatsappBusy || !whatsappConfig?.enabled}>
            <MessageCircle className="mr-2 h-4 w-4" />{whatsappBusy ? 'Conectando...' : 'Conectar WhatsApp'}
          </Button>
          <Button onClick={() => { window.location.href = `/api/v1/integrations/google/start?company_id=${companyId}`; }}>
            <Cloud className="mr-2 h-4 w-4" />Reconectar Google
          </Button>
          <Button
            variant="ghost"
            onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />Abrir Google Calendar
          </Button>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
          {whatsappStatus}
          {whatsappConnections[0] && (
            <span className="ml-2 text-sabero-navy">
              {whatsappConnections[0].verified_name || whatsappConnections[0].display_phone_number || whatsappConnections[0].phone_number_id}
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function loadFacebookSdk(appId: string, version: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version,
      });
      resolve();
    };

    if (document.getElementById('facebook-jssdk')) {
      const timer = window.setInterval(() => {
        if (window.FB) {
          window.clearInterval(timer);
          resolve();
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(timer);
        if (!window.FB) reject(new Error('El SDK de Facebook no termino de cargar.'));
      }, 10000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('No se pudo cargar el SDK de Facebook.'));
    document.body.appendChild(script);
  });
}

function parseWhatsAppSignupMessage(event: MessageEvent) {
  if (!isAllowedMetaOrigin(event.origin)) return null;
  if (typeof event.data !== 'string') return null;

  try {
    const parsed = JSON.parse(event.data) as {
      type?: string;
      event?: string;
      data?: Record<string, unknown>;
    };

    if (parsed.type !== 'WA_EMBEDDED_SIGNUP' || !parsed.data || typeof parsed.data !== 'object') {
      return null;
    }

    return {
      event: typeof parsed.event === 'string' ? parsed.event : undefined,
      status: typeof parsed.data.status === 'string' ? parsed.data.status : undefined,
      waba_id: typeof parsed.data.waba_id === 'string' ? parsed.data.waba_id : undefined,
      phone_number_id: typeof parsed.data.phone_number_id === 'string' ? parsed.data.phone_number_id : undefined,
    };
  } catch {
    return null;
  }
}

function isAllowedMetaOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && (
      url.hostname === 'facebook.com' ||
      url.hostname.endsWith('.facebook.com')
    );
  } catch {
    return false;
  }
}

function Knowledge({ companyId, files, reload, pushLog }: { companyId: string; files: DriveFile[]; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [pickerConfig, setPickerConfig] = useState<PickerConfig | null>(null);
  const [pickerReady, setPickerReady] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [tokenClient, setTokenClient] = useState<TokenClient | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPicker() {
      const config = await apiRequest<PickerConfig>(`/integrations/google/picker-config?company_id=${companyId}`);
      if (cancelled) return;
      setPickerConfig(config);

      if (!config.enabled || !config.client_id) {
        pushLog('Google Picker pendiente: revisa GOOGLE_PICKER_API_KEY y GOOGLE_APP_ID.');
        return;
      }

      waitForGoogleLibraries(config, cancelled);
    }

    void loadPicker();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  function waitForGoogleLibraries(config: PickerConfig, cancelled: boolean) {
    const timer = window.setInterval(() => {
      if (cancelled) {
        window.clearInterval(timer);
        return;
      }

      if (!window.google?.accounts?.oauth2 || !window.gapi) return;

      window.clearInterval(timer);
      window.gapi.load('picker', () => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.client_id,
          scope: config.scopes.join(' '),
          callback: (response: { access_token?: string; error?: string }) => {
            if (response.error || !response.access_token) {
              pushLog(`Google Picker no entrego token: ${response.error || 'sin token'}.`);
              setPickerBusy(false);
              return;
            }

            setAccessToken(response.access_token);
            openPicker(config, response.access_token);
          },
        });

        setTokenClient(client);
        setPickerReady(true);
        pushLog('Google Picker listo para seleccionar documentos.');
      });
    }, 200);
  }

  function selectFiles() {
    if (!pickerConfig?.enabled || !tokenClient || !pickerReady) {
      pushLog('Google Picker todavia no esta listo.');
      return;
    }

    setPickerBusy(true);
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }

  function openPicker(config: PickerConfig, token: string) {
    const view = new window.google.picker.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes([
        'application/pdf',
        'application/vnd.google-apps.document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].join(','));

    new window.google.picker.PickerBuilder()
      .setDeveloperKey(config.developer_key)
      .setAppId(config.app_id)
      .setOAuthToken(token)
      .setCallback((data: { action: string; docs?: PickerDocument[] }) => {
        void handlePickerSelection(data);
      })
      .addView(view)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .build()
      .setVisible(true);
  }

  async function handlePickerSelection(data: { action: string; docs?: PickerDocument[] }) {
    if (data.action !== window.google.picker.Action.PICKED) {
      setPickerBusy(false);
      return;
    }

    for (const doc of data.docs || []) {
      await apiRequest('/google-drive/files', {
        method: 'POST',
        body: JSON.stringify({
          company_id: companyId,
          google_file_id: doc.id,
          name: doc.name,
          mime_type: doc.mimeType,
          web_view_link: doc.url,
        }),
      });
      pushLog(`Documento autorizado: ${doc.name}.`);
    }

    setPickerBusy(false);
    await reload(companyId);
  }

  async function syncAll() {
    if (!files.length) {
      pushLog('Primero selecciona documentos de Drive; no hay archivos para sincronizar.');
      return;
    }

    setSyncing(true);
    try {
      await apiRequest(`/google-drive/sync?company_id=${companyId}`, { method: 'POST' });
      pushLog('Sincronizacion Drive ejecutada.');
      await reload(companyId);
    } finally {
      setSyncing(false);
    }
  }
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">RAG comercial</p>
          <h2 className="mt-2 text-3xl font-black text-sabero-navy">Documentos autorizados</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={selectFiles} disabled={!pickerReady || pickerBusy}>
            <Cloud className="mr-2 h-4 w-4" />{pickerBusy ? 'Abriendo Drive...' : 'Seleccionar documentos'}
          </Button>
          <Button variant="ghost" onClick={syncAll} disabled={syncing}>
            <RefreshCw className="mr-2 h-4 w-4" />{syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
          </Button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ['1', 'Selecciona documentos', 'PDF, Google Docs o DOCX desde Drive.'],
          ['2', 'Autoriza acceso', 'Google permite leer solo archivos elegidos.'],
          ['3', 'Sincroniza RAG', 'Se indexan fragmentos para responder sin inventar.'],
        ].map(([step, title, text]) => (
          <div key={step} className="rounded-2xl border border-sabero-electric/20 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sabero-electric">Paso {step}</p>
            <h3 className="mt-2 font-black text-sabero-navy">{title}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{text}</p>
          </div>
        ))}
      </div>
      {!pickerConfig?.enabled && (
        <div className="mt-4 rounded-2xl border border-sabero-crimson/25 bg-red-50 px-4 py-3 text-sm font-bold text-sabero-crimson">
          Google Picker aun no esta habilitado. Revisa GOOGLE_PICKER_API_KEY y GOOGLE_APP_ID en backend/.env.
        </div>
      )}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        {files.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-sabero-electric" />
            <p className="mt-3 font-black text-sabero-navy">Todavia no hay documentos autorizados.</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Primero usa “Seleccionar documentos”; luego presiona “Sincronizar Drive”.</p>
          </div>
        ) : files.map((file) => (
          <div key={file.id} className="flex items-center justify-between border-b border-slate-200 p-4 last:border-0">
            <div>
              <p className="font-black text-sabero-navy">{file.name}</p>
              <p className="text-sm text-slate-500">{file.mime_type}</p>
            </div>
            <StatusPill active={file.sync_status === 'indexed'} label={file.sync_status} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Meetings({ meetings, reload }: { meetings: Meeting[]; reload: () => Promise<void> }) {
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Google Calendar</p>
          <h2 className="mt-2 text-3xl font-black text-sabero-navy">Reuniones agendadas por el agente</h2>
        </div>
        <Button variant="ghost" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        {meetings.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarClock className="mx-auto h-10 w-10 text-sabero-electric" />
            <p className="mt-3 font-black text-sabero-navy">Aun no hay reuniones registradas.</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Cuando el agente cierre una cita, aparecera aqui y tambien quedara en Google Calendar.</p>
          </div>
        ) : meetings.map((meeting) => (
          <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4 last:border-0">
            <div>
              <p className="font-black text-sabero-navy">{meeting.title}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {meeting.attendee_name || meeting.attendee_email || 'Prospecto'} · {formatDateTime(meeting.start_time)}
              </p>
            </div>
            <StatusPill active={meeting.status === 'booked'} label={meeting.status} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function AgentConfig({ companyId, settings, reload, pushLog }: { companyId: string; settings: AgentSettings | null; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [brief, setBrief] = useState('Somos SABERO Consulting. Vendemos software a medida, arquitectura cloud y automatizaciones con IA para empresas que quieren vender mas, operar mejor y escalar.');
  const [rules, setRules] = useState(settings?.settings.system_rules || '');
  const [manualServiceName, setManualServiceName] = useState('');
  const [manualServiceDescription, setManualServiceDescription] = useState('');

  useEffect(() => {
    setRules(settings?.settings.system_rules || '');
  }, [settings?.settings.system_rules]);

  async function generateFromBrief() {
    const cleanBrief = brief.trim();
    if (!cleanBrief) {
      pushLog('Escribe un briefing corto para configurar el agente.');
      return;
    }

    const generatedRules = [
      `Contexto del negocio: ${cleanBrief}`,
      'Actua como vendedor consultivo senior: diagnostica necesidad, explica beneficios de negocio y orienta hacia una reunion.',
      'Para cada servicio, explica la necesidad que resuelve, el cliente ideal, entregables posibles, valor economico y oportunidad comercial.',
      'Distingue claramente entre capacidades anunciadas y experiencia, certificaciones o resultados que todavia deban confirmarse.',
      'No inventes precios, garantias, casos de exito ni condiciones que no esten en la base de conocimiento o politicas comerciales.',
      'Si el prospecto muestra interes real, solicita nombre, empresa, correo y propone agendar una reunion.',
      'Si falta informacion, responde con honestidad y ofrece que un asesor de SABERO lo confirme.',
    ].join('\n');

    await apiRequest('/agent-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        company_id: companyId,
        agent_name: 'Asesor Comercial IA',
        tone: 'consultivo, claro, persuasivo y profesional',
        system_rules: generatedRules,
      }),
    });

    const serviceCandidates = [
      ['Software a medida', 'Diseño y desarrollo de plataformas web, dashboards, sistemas internos e integraciones empresariales.'],
      ['Arquitectura cloud', 'Diseño, despliegue y optimizacion de infraestructura escalable, segura y preparada para crecimiento.'],
      ['Automatizaciones con IA', 'Automatizacion de procesos comerciales y operativos usando agentes, RAG, integraciones y modelos de IA.'],
    ];

    for (const service of settings?.services || []) {
      await apiRequest(`/agent-settings/services/${service.id}?company_id=${companyId}`, {
        method: 'DELETE',
      });
    }

    for (const [name, description] of robustServicesFromBrief(cleanBrief, serviceCandidates)) {
      await apiRequest('/agent-settings/services', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, name, description, active: true }),
      });
    }

    setRules(generatedRules);
    pushLog('Agente comercial configurado desde el briefing.');
    await reload(companyId);
  }

  async function saveRules() {
    await apiRequest('/agent-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        company_id: companyId,
        system_rules: rules,
      }),
    });
    pushLog('Reglas del agente actualizadas.');
    await reload(companyId);
  }

  async function deleteService(id: string, name: string) {
    await apiRequest(`/agent-settings/services/${id}?company_id=${companyId}`, {
      method: 'DELETE',
    });
    pushLog(`Servicio eliminado: ${name}.`);
    await reload(companyId);
  }

  async function addManualService() {
    const name = manualServiceName.trim();
    const description = manualServiceDescription.trim();
    if (!name || !description) {
      pushLog('Completa nombre y descripcion del servicio manual.');
      return;
    }

    await apiRequest('/agent-settings/services', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, name, description, active: true }),
    });
    setManualServiceName('');
    setManualServiceDescription('');
    pushLog(`Servicio agregado manualmente: ${name}.`);
    await reload(companyId);
  }
  return (
    <div className="grid gap-6">
      <Panel>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Configurar con IA</p>
        <h2 className="mt-2 text-3xl font-black text-sabero-navy">Describe tu negocio y preparamos el vendedor</h2>
        <textarea
          className="mt-5 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-sabero-navy outline-none focus:border-sabero-electric"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="Ejemplo: vendemos software a medida para inmobiliarias, automatizamos ventas por WhatsApp y agendamos demos..."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={generateFromBrief}><Bot className="mr-2 h-4 w-4" />Generar configuracion</Button>
          <StatusPill active={Boolean(settings?.settings.system_rules)} label={settings?.settings.system_rules ? 'Config editable' : 'Pendiente'} />
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Prom comercial</p>
            <h3 className="mt-2 text-2xl font-black text-sabero-navy">{settings?.settings.agent_name || 'Agente comercial IA'}</h3>
          </div>
          <Button variant="ghost" onClick={saveRules}>Guardar edicion</Button>
        </div>
        <textarea
          className="mt-5 min-h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-sabero-navy outline-none focus:border-sabero-electric"
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder="Aqui quedaran las reglas comerciales del agente. Puedes editarlas manualmente."
        />
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Servicios detectados</p>
            <h3 className="mt-2 text-xl font-black text-sabero-navy">Lo que el agente puede vender</h3>
          </div>
          <StatusPill active={Boolean(settings?.services.length)} label={`${settings?.services.length || 0} servicios`} />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[0.7fr_1.3fr_auto]">
          <input
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric"
            placeholder="Agregar servicio manual"
            value={manualServiceName}
            onChange={(event) => setManualServiceName(event.target.value)}
          />
          <input
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric"
            placeholder="Descripcion comercial del servicio"
            value={manualServiceDescription}
            onChange={(event) => setManualServiceDescription(event.target.value)}
          />
          <Button onClick={addManualService}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
        </div>
        <div className="mt-5 grid gap-3">
          {settings?.services.length ? settings.services.map((service) => (
            <div key={service.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-black text-sabero-navy">{service.name}</p>
                <Button variant="ghost" onClick={() => void deleteService(service.id, service.name)}>
                  <Trash2 className="mr-2 h-4 w-4" />Eliminar
                </Button>
              </div>
              <p className="mt-2 text-sm text-slate-600">{service.description}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-bold text-slate-500">
              Escribe el prom del negocio y presiona “Generar configuracion”; aqui se listaran automaticamente los servicios detectados.
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function servicesFromBrief(brief: string, fallback: string[][]) {
  const serviceNames = brief
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => line.replace(/^[-*•]\s+/, '').replace(/[.;:]$/, '').trim())
    .filter(Boolean);

  if (!serviceNames.length) return fallback;

  return Array.from(new Set(serviceNames)).map((name) => [
    name,
    [
      `Servicio de ${name}.`,
      'Debe venderse de forma consultiva: identificar la necesidad del prospecto, explicar entregables posibles y conectar el servicio con valor economico.',
      'Si el prospecto pide experiencia, certificaciones, precios o resultados especificos, confirmar solo lo que exista en la base de conocimiento o derivar a una reunion con SABERO.',
    ].join(' '),
  ]);
}

function robustServicesFromBrief(brief: string, fallback: string[][]) {
  const lines = brief
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const listItems = lines
    .map((line) => {
      const bulletMatch = line.match(/^[-*•‣–—]\s+(.+)$/);
      if (bulletMatch) return bulletMatch[1];

      const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) return numberedMatch[1];

      return null;
    })
    .filter((value): value is string => Boolean(value))
    .map((line) => line.replace(/[.;:]$/, '').trim())
    .filter((line) => line.length > 3);
  const serviceNames = listItems.length ? listItems : extractServicePhraseList(brief);

  if (!serviceNames.length) return fallback;

  return Array.from(new Set(serviceNames)).map((name) => [
    name,
    [
      `Servicio de ${name}.`,
      'Debe venderse de forma consultiva: identificar la necesidad del prospecto, explicar entregables posibles y conectar el servicio con valor economico.',
      'Si el prospecto pide experiencia, certificaciones, precios o resultados especificos, confirmar solo lo que exista en la base de conocimiento o derivar a una reunion con SABERO.',
    ].join(' '),
  ]);
}

function extractServicePhraseList(brief: string) {
  const marker = brief.match(/(?:servicios|capacidades|areas de negocio|vende|ofrece)\s*:?\s*([\s\S]+)/i);
  const source = marker?.[1] || brief;

  return source
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^y\s+/i, '').replace(/[.;:]$/, '').trim())
    .filter((item) => item.length > 8)
    .filter((item) => !/^(para cada|distingue|identifica|explica|servicios y capacidades)/i.test(item));
}

function Access({ companyId, users, reload, pushLog }: { companyId: string; users: SessionUser[]; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function createUser() {
    await apiRequest('/auth/users', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, email, password, role: 'admin' }),
    });
    setEmail('');
    setPassword('');
    pushLog('Acceso de empresa creado.');
    await reload(companyId);
  }
  return (
    <Panel>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Multiempresa</p>
      <h2 className="mt-2 text-3xl font-black text-sabero-navy">Crear accesos por correo</h2>
      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric" placeholder="Contrasena segura" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button variant="danger" onClick={createUser}>Crear acceso</Button>
      </div>
      <div className="mt-6 grid gap-3">
        {users.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="font-black text-sabero-navy">{item.email}</p>
              <p className="text-sm text-slate-500">{item.role}</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
        ))}
      </div>
    </Panel>
  );
}
