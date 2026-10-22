'use client';

import { createContext, Fragment, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { apiRequest, SessionUser } from '@/lib/api';
import { Button } from './ui';

export const RecordPermissions = createContext<SessionUser | null>(null);

export function PaginatedItems<T>({items, label, children}: {items: T[]; label: string; children: (item: T, index: number) => ReactNode}) {
  const pagination=usePagination(items);
  return <>{pagination.items.map((item,index)=><Fragment key={(item as {id?:string})?.id || index}>{children(item,index)}</Fragment>)}<Pagination {...pagination} label={label}/></>;
}

export function usePagination<T>(records: T[], resetKey: unknown = '', size = 10) {
  const [position, setPosition] = useState(1);
  useEffect(() => { setPosition(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(records.length / size));
  const page = Math.min(position, pages);
  useEffect(() => { setPosition(current => Math.min(current, pages)); }, [pages]);
  return { items: records.slice((page - 1) * size, page * size), page, pages, total: records.length, size, setPage: setPosition };
}

export function Pagination({ page, pages, total, size, setPage, label = 'registros' }: {page: number; pages: number; total: number; size: number; setPage: (value: number) => void; label?: string}) {
  if (!total) return null;
  return <nav aria-label={`Paginación de ${label}`} className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
    <span>{(page - 1) * size + 1}–{Math.min(page * size, total)} de {total}</span>
    <div className="flex items-center gap-2"><Button variant="ghost" className="min-h-9 px-2" aria-label={`Página anterior de ${label}`} disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span aria-live="polite">{page} / {pages}</span><Button variant="ghost" className="min-h-9 px-2" aria-label={`Página siguiente de ${label}`} disabled={page === pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div>
  </nav>;
}

export function DeleteRecordButton({ resource, id, name, reload, protectedRecord = false }: {resource: string; id: string; name: string; reload: () => Promise<void>; protectedRecord?: boolean}) {
  const user = useContext(RecordPermissions);
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (!user || !['owner','admin'].includes(user.role) || protectedRecord || (['users','services','policies'].includes(resource) && user.role !== 'owner')) return null;
  const explanation = resource === 'companies' ? 'Se desactivará el acceso de esta empresa y se retirará de la lista. Su historial se conservará.'
    : resource === 'requests' ? 'Se retirará la solicitud de la lista. Si ya tiene una cuenta, esa cuenta conservará su acceso.'
    : resource === 'files' ? 'Se retirará este documento del conocimiento del agente. El archivo original permanecerá en Google Drive.'
    : resource === 'users' ? 'Se desactivará este acceso y sus sesiones. Su historial se conservará.'
    : 'Esta acción eliminará el registro. Si tiene datos vinculados que impiden borrarlo, te lo indicaremos.';
  async function remove() {
    setBusy(true); setError('');
    try { await apiRequest(`/records/${resource}/${encodeURIComponent(id)}`, {method: 'DELETE'}); await reload(); dialog.current?.close(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo eliminar.'); }
    finally { setBusy(false); }
  }
  return <><Button variant="ghost" className="min-h-9 px-3 text-xs text-red-700" aria-label={`Eliminar ${name}`} onClick={() => {setError(''); dialog.current?.showModal();}}><Trash2 className="mr-2 h-4 w-4" />Eliminar</Button>
    <dialog ref={dialog} aria-label={`Eliminar ${name}`} onCancel={event => {if(busy) event.preventDefault();}} className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-white p-6 text-slate-700 shadow-2xl backdrop:bg-slate-950/50">
      <h2 className="text-xl font-bold text-sabero-navy">¿Eliminar {name}?</h2><p className="mt-3 text-sm leading-6">{explanation}</p>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex justify-end gap-3"><Button variant="ghost" disabled={busy} onClick={() => dialog.current?.close()} autoFocus>Cancelar</Button><Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar'}</Button></div>
    </dialog></>;
}
