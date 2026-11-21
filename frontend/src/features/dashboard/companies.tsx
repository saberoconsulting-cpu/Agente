'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeleteRecordButton, Pagination, usePagination } from '@/components/list-controls';
import {AccessRequests, type Application} from './access-requests';
import {CompanyAccessModal} from './company-access-modal';
import { CompanyCharts } from './company-charts';
import { ArrowUpRight, Building2, Search, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import styles from './platform-console.module.css';

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
  const [section, setSection] = useState<'overview' | 'access' | 'directory'>('overview');
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
  const activeCompanies=items.filter(item=>item.status==='active').length;
  return <div className={styles.console}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>CONTROL DE OPERACIONES</p><h1>Pulso de la plataforma<span>.</span></h1><p className={styles.subtitle}>Una visión precisa de tus empresas, su actividad y el consumo del agente.</p></div>
      <div className={styles.sync}><span className={styles.syncLabel}><i data-warning={Boolean(error)}/>{error?'Actualización pendiente':'Sincronización automática'}</span><span className={styles.timestamp}>{updatedAt?'Actualizado '+new Date(updatedAt).toLocaleTimeString('es-PE'):'Conectando con la plataforma'}</span><div className={styles.headerActions}><div className={styles.viewSelector} role="group" aria-label="Vistas de la plataforma"><button type="button" className={styles.sectionLink} aria-pressed={section==='overview'} aria-controls="platform-overview" onClick={()=>setSection('overview')}>Resumen</button><button type="button" className={styles.sectionLink} aria-pressed={section==='access'} aria-controls="platform-access" onClick={()=>setSection('access')}>Gestión de accesos</button><button type="button" className={styles.sectionLink} aria-pressed={section==='directory'} aria-controls="platform-directory" onClick={()=>setSection('directory')}>Directorio</button></div><button type="button" className={styles.refresh} disabled={refreshing} onClick={()=>void load()} aria-label="Actualizar empresas"><RefreshCw size={14} className={refreshing?'animate-spin motion-reduce:animate-none':''}/>Actualizar</button></div></div>
    </header>
    {error&&<p role="alert" className={styles.alert}>{error}</p>}
    <div id="platform-overview" className={styles.viewPanel} hidden={section!=='overview'}><section className={styles.metrics} aria-label="Indicadores de la plataforma">
      {[{label:'Empresas registradas',count:items.length,note:activeCompanies+' activas'},{label:'Contactos',count:value('contacts'),note:'Base comercial consolidada'},{label:'Consultas de IA',count:value('ai_requests'),note:'Acumulado del mes'},{label:'Tokens procesados',count:value('tokens'),note:'Acumulado del mes'}].map(item=><div className={styles.metric} key={item.label}><div className={styles.metricLabel}><span>{item.label}</span></div><strong>{loading?'—':item.count}</strong><span className={styles.metricNote}>{item.note}</span></div>)}
    </section>
    <CompanyCharts companies={items} loading={loading}/>
    {!loading&&<p className={styles.coverage}><span className={styles.coverageMark}/>{ready.length} de {items.length} empresas con datos disponibles. Las conexiones pendientes quedan fuera de los totales.</p>}
    </div><section id="platform-access" hidden={section!=='access'} className={styles.panel} aria-labelledby="pending-companies-title"><div className={styles.sectionHeader}><div><p className={styles.eyebrow}>GESTIÓN DE ACCESOS</p><h2 id="pending-companies-title">Empresas por validar</h2></div><span className={styles.pendingCount}>{pending.length}<span>PENDIENTES</span></span></div>
      {pending.length?<div className={styles.requests}>{pendingPagination.items.map(item=><button type="button" key={item.id} onClick={()=>setReviewId(item.id)} aria-label={'Validar '+item.business_name} className={styles.request}><div><strong>{item.business_name}</strong><span>{item.contact_name} · {item.email}</span></div><span className={styles.requestAction}>{item.status==='approved'?'Habilitar acceso':'Revisar solicitud'}<ArrowUpRight size={17}/></span></button>)}</div>:<div className={styles.emptyInline}><span className={styles.emptyMark}>—</span><div><strong>No hay solicitudes pendientes</strong><p>Las nuevas solicitudes de acceso aparecerán aquí para tu revisión.</p></div></div>}
      <Pagination {...pendingPagination} label="empresas por validar"/>
    </section>
    <section id="platform-directory" hidden={section!=='directory'} className={styles.panel} aria-labelledby="company-directory-title"><div className={styles.sectionHeader}><div><p className={styles.eyebrow}>DIRECTORIO</p><h2 id="company-directory-title">Empresas de la plataforma<span className={styles.totalCount}>{items.length}</span></h2></div><label className={styles.search}><Search size={16}/><input aria-label="Buscar empresas" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar empresa o sector"/></label></div>
      {loading?<p role="status" className={styles.empty}>Consultando empresas…</p>:!filtered.length?<div className={styles.empty}><Building2 size={24}/><p>No hay empresas para mostrar.</p></div>:<div className={styles.tableScroll}><table className={styles.table}><thead><tr>{['Empresa','Estado','Contactos','Conversaciones','Tokens · mes','Acciones'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{pagination.items.map(item=><tr key={item.id}><td><button type="button" onClick={()=>setSelected(item.id)} className={styles.companyName}>{item.name}</button><span className={styles.companyMeta}>{item.sector} / {item.id}</span></td><td><span className={styles.status} data-status={item.status}><i/>{statuses[item.status]||item.status}</span></td><td className={styles.numeric}>{item.metrics?.contacts??'—'}</td><td className={styles.numeric}>{item.metrics?.conversations??'—'}</td><td className={styles.numeric}>{item.metrics?Number(item.metrics.tokens).toLocaleString('es-PE'):'—'}</td><td><div className={styles.rowActions}><button type="button" className={styles.detailButton} onClick={()=>setSelected(item.id)} aria-pressed={selected===item.id}>Ver empresa<ArrowUpRight size={15}/></button><DeleteRecordButton resource="companies" id={item.id} name={item.name} reload={load} protectedRecord={item.id===adminCompanyId}/></div></td></tr>)}</tbody></table></div>}
      <Pagination {...pagination} label="empresas"/>
    </section>
    <div className={styles.bottomNote}><span>SABERO AI / CENTRO DE CONTROL</span><span>Actualización cada 10 segundos</span></div>
    {company&&<CompanyAccessModal company={company} application={applications.find(item=>item.company_id===company.id)} adminCompanyId={adminCompanyId} onClose={()=>setSelected(null)} onChanged={async status=>{setItems(current=>current.map(item=>item.id===company.id?{...item,status}:item));await refreshAfterReview();}}/>}
    {reviewId&&<AccessRequests key={reviewId} adminCompanyId={adminCompanyId} initialRequestId={reviewId} onDismiss={()=>setReviewId(null)} onReviewed={refreshAfterReview}/>}
  </div>;
}
