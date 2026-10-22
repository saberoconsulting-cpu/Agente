'use client';

import { Pagination, usePagination } from './list-controls';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import type { OpportunityFollowupDraft } from '@/lib/types';
import { Button, Panel, StatusPill } from '@/components/ui';

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
  const pagination=usePagination(drafts);
  const [edits, setEdits] = useState<Record<string, string>>({});

  async function approve(draft: OpportunityFollowupDraft) {
    const template = window.prompt('Nombre de plantilla aprobada (déjalo vacío si estás dentro de la ventana de 24 h):', draft.template_name || '') || undefined;
    await apiRequest(`/opportunities/followup-drafts/${draft.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ message: edits[draft.id] || draft.message, template_name: template }),
    });
    await reload();
  }

  async function reject(draft: OpportunityFollowupDraft) {
    const reason = window.prompt('Motivo para descartar el seguimiento:', '');
    await apiRequest(`/opportunities/followup-drafts/${draft.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || undefined }),
    });
    await reload();
  }

  return (
    <Panel className={compact ? 'p-5' : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[.2em] text-sabero-crimson">Seguimientos por aprobar</p>
          <h2 className="mt-2 text-xl font-black text-sabero-navy">{drafts.length} pendientes</h2>
        </div>
        <StatusPill active={drafts.length > 0} label={drafts.length ? 'Acción requerida' : 'Al día'} />
      </div>
      <div className="mt-4 grid gap-3">
        {drafts.length ? (
          pagination.items.map((draft) => (
            <div key={draft.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-black text-sabero-navy">{draft.lead_name || draft.whatsapp_number}</p>
                <StatusPill active={draft.priority === 'high'} label={draft.priority === 'high' ? 'Alta prioridad' : 'Normal'} />
              </div>
              <p className="mt-1 text-xs font-bold text-slate-500">{draft.rule_key.replaceAll('_', ' ')} · {draft.assignee_email || 'Sin responsable'}</p>
              {canOperate ? (
                <>
                  <textarea
                    aria-label={`Mensaje para ${draft.lead_name || draft.whatsapp_number}`}
                    value={edits[draft.id] ?? draft.message}
                    onChange={(event) => setEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
                    className="mt-3 min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="min-h-9 px-3 text-xs" onClick={() => void approve(draft)}>Aprobar y enviar</Button>
                    <Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => void reject(draft)}>Descartar</Button>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-600">{draft.message}</p>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No hay seguimientos pendientes.</p>
        )}
      </div>
      <Pagination {...pagination} label="seguimientos"/>
    </Panel>
  );
}
