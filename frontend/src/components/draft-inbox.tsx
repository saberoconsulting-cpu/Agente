'use client';

import { Pagination, usePagination } from './list-controls';
import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { OpportunityFollowupDraft } from '@/lib/types';
import { Button, Panel, StatusPill } from '@/components/ui';

const PAGE_SIZE = 4;

export function DraftInbox({
  drafts,
  canOperate,
  reload,
  compact = false,
}: {
  drafts: OpportunityFollowupDraft[];
  canOperate: boolean;
  reload: () => Promise<void>;
  compact?: boolean;
}) {
  const pagination = usePagination(drafts, '', PAGE_SIZE);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(draft: OpportunityFollowupDraft) {
    const template = window.prompt('Nombre de plantilla aprobada (déjalo vacío si estás dentro de la ventana de 24 h):', draft.template_name || '') || undefined;
    setBusy(draft.id);
    try {
      await apiRequest(`/opportunities/followup-drafts/${draft.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ message: edits[draft.id] || draft.message, template_name: template }),
      });
      await reload();
    } finally { setBusy(null); }
  }

  async function reject(draft: OpportunityFollowupDraft) {
    const reason = window.prompt('Motivo para descartar el seguimiento:', '');
    setBusy(draft.id);
    try {
      await apiRequest(`/opportunities/followup-drafts/${draft.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || undefined }),
      });
      await reload();
    } finally { setBusy(null); }
  }

  return (
    <Panel className={compact ? 'p-5' : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-sabero-crimson">Seguimientos por aprobar</p>
          <h2 className="mt-1 text-lg font-black text-sabero-navy">{drafts.length} pendientes</h2>
        </div>
        <StatusPill active={drafts.length > 0} label={drafts.length ? 'Acción requerida' : 'Al día'} />
      </div>
      <ul className="mt-4 grid gap-2.5">
        {drafts.length ? (
          pagination.items.map((draft) => {
            const name = draft.lead_name || draft.whatsapp_number;
            const isEditing = editing === draft.id;
            const rowBusy = busy === draft.id;
            return (
              <li key={draft.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-sabero-navy">{name}</p>
                    <p className="truncate text-[11px] font-bold uppercase tracking-wide text-slate-400">{draft.rule_key.replaceAll('_', ' ')} · {draft.assignee_email || 'Sin responsable'}</p>
                  </div>
                  <StatusPill active={draft.priority === 'high'} label={draft.priority === 'high' ? 'Alta prioridad' : 'Normal'} />
                </div>
                {isEditing && canOperate ? (
                  <textarea
                    aria-label={`Mensaje para ${name}`}
                    value={edits[draft.id] ?? draft.message}
                    onChange={(event) => setEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                    className="mt-2 min-h-20 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700"
                  />
                ) : (
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-600">{edits[draft.id] ?? draft.message}</p>
                )}
                {canOperate && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Button disabled={rowBusy} className="min-h-8 px-3 text-xs" onClick={() => void approve(draft)}><Check className="mr-1.5 h-3.5 w-3.5" />Aprobar y enviar</Button>
                    <Button variant="ghost" disabled={rowBusy} className="min-h-8 px-3 text-xs" onClick={() => setEditing(isEditing ? null : draft.id)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{isEditing ? 'Listo' : 'Editar'}</Button>
                    <Button variant="danger" disabled={rowBusy} className="min-h-8 px-3 text-xs" onClick={() => void reject(draft)}><X className="mr-1.5 h-3.5 w-3.5" />Descartar</Button>
                  </div>
                )}
              </li>
            );
          })
        ) : (
          <li className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No hay seguimientos pendientes.</li>
        )}
      </ul>
      <Pagination {...pagination} label="seguimientos"/>
    </Panel>
  );
}
