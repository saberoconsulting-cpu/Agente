'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, CalendarClock, CheckCircle2, Cloud, ExternalLink, FileText, MessageCircle, Plus, RefreshCw, Settings2, Trash2, Users, Zap } from 'lucide-react';
import { apiRequest, SessionUser } from '../../lib/api';
import type { AgentSettings, DashboardSummary, DriveFile, Meeting, Opportunity, OpportunityFollowupDraft } from '../../lib/types';
import { Button, Panel, StatusPill } from '../../components/ui';

export function Overview({ summary, log, drafts, canOperate, reload }: { summary: DashboardSummary | null; log: string[]; drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void> }) {
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


