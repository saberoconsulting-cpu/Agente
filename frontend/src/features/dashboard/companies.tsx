'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeleteRecordButton, PaginatedItems, Pagination, usePagination } from '@/components/list-controls';
import {AccessRequests, type Application} from './access-requests';
import {CompanyAccessModal} from './company-access-modal';
import { CompanyCharts } from './company-charts';
import { Building2, Search, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button, Panel } from '@/components/ui';

export type Company = {
  id: string; name: string; sector: string; status: string; products: string[]; created_at?:string;
  metrics: null | { contacts: number; conversations: number; meetings: number; ai_requests: number; tokens: string };
  contacts: { id: string; name: string | null; whatsapp_number: string; status: string; email?: string | null }[];
  events: { event_type: string; created_at: string }[];
  activity?: {date:string;requests:number;tokens:string}[];
};
const statuses: Record<string, string> = { active: 'Activa', suspended: 'Suspendida', provisioning: 'En preparación', failed: 'Revisar configuración' };

export function Companies({adminCompanyId}:{adminCompanyId:string}) {
  const [items, setItems] = useState<Company[]>([]);
  const [applications,setApplications]=useState<Application[]>([]);
  const [reviewId,setReviewId]=useState<string|null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [updatedAt,setUpdatedAt]=useState<string|null>(null);
  const active=useRef<AbortController|null>(null);
  const load=useCallback(async()=>{
    if(active.current)return;
    const controller=new AbortController();active.current=controller;
    setRefreshing(true);
    try {
      const [result,requests]=await Promise.all([apiRequest<{items:Company[];generated_at?:string}>('/platform/admin/companies',{signal:controller.signal,cache:'no-store'}),apiRequest<{items:Application[]}>('/platform/admin/access-requests',{signal:controller.signal,cache:'no-store'})]);
      if(controller.signal.aborted)return;
      setApplications(requests.items);setItems(result.items);setUpdatedAt(result.generated_at || new Date().toISOString());setError('');
    } catch(problem) {
      if(!controller.signal.aborted)setError('No se pudo actualizar. Se conservan los datos de la consulta anterior.');
    } finally {
      if(active.current===controller){active.current=null;setLoading(false);setRefreshing(false);}
    }
  },[]);
  useEffect(()=>{
    void load();
    const refreshVisible=()=>{if(document.visibilityState==='visible')void load();};
    const timer=window.setInterval(refreshVisible,10000);
    document.addEventListener('visibilitychange',refreshVisible);
    return ()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refreshVisible);active.current?.abort();active.current=null;};
  },[load]);
  const filtered = useMemo(() => items.filter(item => `${item.name} ${item.id} ${item.sector}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [items, search]);
  const pending=applications.filter(item=>['pending','approved'].includes(item.status));
  const pendingPagination=usePagination(pending);
  const refreshAfterReview=async()=>{active.current?.abort();active.current=null;await load();};
  const pagination = usePagination(filtered, search);
  const company = items.find(item => item.id === selected);
  const ready = items.filter(item => item.metrics);
  const value = (key: 'contacts' | 'conversations' | 'ai_requests' | 'tokens') => ready.reduce((total, item) => total + Number(item.metrics?.[key] || 0), 0).toLocaleString('es-PE');
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-sabero-navy">Pulso de la plataforma</h2><p className="mt-1 text-sm text-slate-500">Actividad y consumo de tus empresas.</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="flex items-center justify-end gap-2 text-xs font-medium text-slate-600"><span className={`h-2 w-2 rounded-full ${error?'bg-amber-400':'bg-emerald-500'}`}/>{error?'Actualización pendiente':'Actualización cada 10 s'}</p><p aria-live="off" className="mt-1 text-xs tabular-nums text-slate-400">{updatedAt?`Actualizado ${new Date(updatedAt).toLocaleTimeString('es')}`:'Conectando...'}</p></div><Button variant="ghost" disabled={refreshing} onClick={()=>void load()} aria-label="Actualizar empresas"><RefreshCw className={`h-4 w-4 ${refreshing?'animate-spin':''}`}/></Button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Empresas registradas', items.length], ['Contactos', value('contacts')], ['Llamadas IA · mes', value('ai_requests')], ['Tokens IA · mes', value('tokens')]].map(([label, count]) => <Panel key={label}><p className="text-sm text-slate-500">{label}</p><strong className="mt-3 block text-3xl text-sabero-navy">{loading ? '—' : count}</strong></Panel>)}</div>
    <CompanyCharts companies={items} loading={loading}/>
    {!loading && <p className="text-xs text-slate-500">Volumen disponible de {ready.length} de {items.length} empresas. Las empresas sin agente o con conexión pendiente no se incluyen en los totales. Consumo registrado desde esta actualización.</p>}
    <Panel><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-sabero-navy">Empresas por validar</h2><p className="mt-1 text-sm text-slate-500">Abre la ficha para revisar los datos, aprobar el pago, habilitar o rechazar.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{pending.length} pendientes</span></div>{pending.length?<div className="divide-y divide-slate-100">{pendingPagination.items.map(item=><button type="button" key={item.id} onClick={()=>setReviewId(item.id)} aria-label={`Validar ${item.business_name}`} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-4 text-left hover:bg-blue-50/50"><div><p className="font-semibold text-sabero-navy">{item.business_name}</p><p className="mt-1 text-xs text-slate-500">{item.contact_name} · {item.email}</p></div><span className="text-sm font-semibold text-sabero-electric">{item.status==='approved'?'Habilitar acceso':'Revisar solicitud'} →</span></button>)}</div>:<p className="py-4 text-sm text-slate-400">No hay empresas pendientes de validación.</p>}<Pagination {...pendingPagination} label="empresas por validar"/></Panel>
    <Panel><label className="mb-5 flex max-w-md items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><Search className="h-4 w-4 text-slate-400"/><input aria-label="Buscar empresas" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar empresa o sector" className="w-full bg-transparent text-sm outline-none"/></label>
      {loading ? <p role="status" className="py-12 text-center text-slate-500">Consultando empresas…</p> : !filtered.length ? <div className="py-12 text-center text-slate-500"><Building2 className="mx-auto mb-3 h-8 w-8"/>No hay empresas para mostrar.</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wider text-slate-500"><tr>{['Empresa', 'Estado', 'Contactos', 'Conversaciones', 'Tokens · mes', 'Detalle'].map(label => <th className="px-3 py-4" key={label}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{pagination.items.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-3 py-4"><button type="button" onClick={()=>setSelected(item.id)} className="font-semibold text-sabero-navy hover:text-sabero-electric hover:underline">{item.name}</button><span className="mt-1 block text-xs text-slate-500">{item.sector} · {item.id}</span></td><td className="px-3 py-4">{statuses[item.status] || item.status}</td><td className="px-3 py-4">{item.metrics?.contacts ?? '—'}</td><td className="px-3 py-4">{item.metrics?.conversations ?? '—'}</td><td className="px-3 py-4">{item.metrics ? Number(item.metrics.tokens).toLocaleString('es-PE') : '—'}</td><td className="px-3 py-4"><Button variant="ghost" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id}>Ver empresa</Button><DeleteRecordButton resource="companies" id={item.id} name={item.name} reload={load} protectedRecord={item.id===adminCompanyId}/></td></tr>)}</tbody></table></div>}
      <Pagination {...pagination} label="empresas"/>
    </Panel>
    {company&&<CompanyAccessModal company={company} application={applications.find(item=>item.company_id===company.id)} adminCompanyId={adminCompanyId} onClose={()=>setSelected(null)} onChanged={async status=>{setItems(current=>current.map(item=>item.id===company.id?{...item,status}:item));await refreshAfterReview();}}/>}
    {reviewId&&<AccessRequests key={reviewId} adminCompanyId={adminCompanyId} initialRequestId={reviewId} onDismiss={()=>setReviewId(null)} onReviewed={refreshAfterReview}/>}

  </>;
}
