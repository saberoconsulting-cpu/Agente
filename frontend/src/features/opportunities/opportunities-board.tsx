'use client';

import { DeleteRecordButton, PaginatedItems } from '@/components/list-controls';
import { RefreshCw } from 'lucide-react';
import { apiRequest, SessionUser } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { Opportunity, OpportunityFollowupDraft } from '@/lib/types';
import { Breakdown } from '@/components/breakdown';
import { DraftInbox } from '@/components/draft-inbox';
import { Button, Panel, StatusPill } from '@/components/ui';

export function Opportunities({ items, users, drafts, canOperate, reload }: { items: Opportunity[]; users: SessionUser[]; drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void> }) {
  const stages = [['nuevo', 'Nuevas'], ['calificado', 'Calificadas'], ['reunion_propuesta', 'Reunión'], ['reunion_agendada', 'Agendadas'], ['propuesta', 'Propuestas'], ['ganado', 'Ganadas'], ['perdido', 'Perdidas']] as const;
  async function move(id: string, stage: string) { await apiRequest(`/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }); await reload(); }
  async function handoff(id: string, assigneeId: string) { if (!assigneeId) return; await apiRequest(`/opportunities/${id}/handoff`, { method: 'POST', body: JSON.stringify({ assignee_id: assigneeId }) }); await reload(); }
  async function proposal(id: string) { await apiRequest(`/opportunities/${id}/proposals`, { method: 'POST' }); await reload(); }
  const sellers = users.filter((item) => item.active !== false && ['owner', 'admin'].includes(item.role));
  return <div className="grid gap-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.22em] text-sabero-crimson">Embudo comercial</p><h2 className="mt-2 text-3xl font-black text-sabero-navy">Oportunidades</h2></div><Button variant="ghost" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button></div><DraftInbox drafts={drafts} canOperate={canOperate} reload={reload} compact /><div className="grid gap-4 xl:grid-cols-3">{stages.map(([stage, label]) => <Panel key={stage}><h3 className="font-black text-sabero-navy">{label}</h3><div className="mt-4 grid gap-3"><PaginatedItems items={items.filter((item) => item.stage === stage)} label={label}>{(item) => <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="font-black text-sabero-navy">{item.lead_name || item.whatsapp_number}</p><p className="mt-1 text-xs font-bold text-slate-500">Score {item.score} · {item.assignee_email || 'Sin asignar'}</p>{item.score >= 60 && !item.assignee_email && <select aria-label="Asignar vendedor" defaultValue="" onChange={(event) => void handoff(item.id, event.target.value)} className="mt-3 min-h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-sabero-navy"><option value="">Derivar a vendedor…</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.email}</option>)}</select>}<div className="mt-3 flex flex-wrap gap-2">{stage === 'nuevo' && <Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'calificado')}>Confirmar</Button>}{stage === 'calificado' && <><Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'reunion_propuesta')}>Proponer reunión</Button><Button variant="ghost" className="min-h-9 px-3 text-xs" onClick={() => void proposal(item.id)}>Crear propuesta</Button></>}{stage === 'propuesta' && <Button className="min-h-9 px-3 text-xs" onClick={() => void move(item.id, 'ganado')}>Marcar ganada</Button>}{canOperate && <DeleteRecordButton resource="opportunities" id={item.id} name={item.lead_name || item.whatsapp_number} reload={reload}/>}</div></div>}</PaginatedItems></div></Panel>)}</div></div>;
}


