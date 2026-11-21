'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Building2,Check,CheckCircle2,Mail,Phone,RefreshCw,ShieldCheck,X} from 'lucide-react';
import {usePagination} from '@/components/list-controls';
import {ReviewModal} from '@/components/review-modal';
import {AccessRequestList} from './access-request-list';
import styles from './access-requests.module.css';
import {apiRequest} from '@/lib/api';
import {BrandIcon} from '@/components/brand-icons';
import {publicPlans} from '@/content/plans';
import {Button,Panel} from '@/components/ui';
import {useActionConfirmation,useUnsavedChanges} from '@/components/action-confirmation';

export type Application={has_password?:boolean;id:string;business_name:string;contact_name:string;email:string;phone:string;phone_country?:string;status:string;created_at:string;plan?:string|null;payment_reference?:string;company_id?:string;rejection_reason?:string;notification?:{status:string;decision:string;error_code?:string;sent_at?:string;attempts:number}|null};
type Company={id:string;name:string;status:string;products:string[]};
const labels:Record<string,string>={pending:'Por revisar',approved:'Aprobada',active:'Acceso habilitado',rejected:'Rechazada'};
const field='mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-sabero-navy outline-none transition focus:border-sabero-electric focus:ring-4 focus:ring-blue-50';
function Badge({status}:{status:string}){return <span className={styles.badge} data-status={status}><i aria-hidden="true"/>{labels[status]||status}</span>;}
function mailLabel(item:Application){return item.notification?.status==='sent'?'Aceptado por Brevo':item.notification?.status==='failed'?'Envío pendiente':item.notification?.status==='skipped'?'Dirección de prueba':item.notification?'En cola':'Sin notificar';}

export function AccessRequests({adminCompanyId,initialRequestId,onDismiss,onReviewed}:{adminCompanyId:string;initialRequestId?:string;onDismiss?:()=>void;onReviewed?:()=>Promise<void>}){
  const {confirmDiscard}=useActionConfirmation();
  const [items,setItems]=useState<Application[]>([]),[companies,setCompanies]=useState<Company[]>([]);
  const [selected,setSelected]=useState<string|null>(initialRequestId||null),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [reference,setReference]=useState(''),[paid,setPaid]=useState(false),[company,setCompany]=useState(''),[reason,setReason]=useState('');
  const [decision,setDecision]=useState<'approve'|'reject'>('approve');
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useUnsavedChanges('access-request-review',Boolean(reference.trim()||paid||(company&&company!=='auto')||reason.trim()||decision==='reject'));
  const heading=useRef<HTMLHeadingElement>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const [requests,registry]=await Promise.all([apiRequest<{items:Application[]}>('/platform/admin/access-requests'),apiRequest<{items:Company[]}>('/platform/admin/companies')]);setItems(requests.items);setCompanies(registry.items.filter(item=>item.id!==adminCompanyId&&item.status==='active'&&item.products.includes('agent')));}
    catch{setError('No se pudieron cargar las solicitudes. Vuelve a intentarlo.');}
    finally{setLoading(false);}
  },[adminCompanyId]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(selected)heading.current?.focus();},[selected]);
  const filtered=useMemo(()=>items.filter(item=>(filter==='all'||item.status===filter)&&`${item.business_name} ${item.contact_name} ${item.email}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),[items,search,filter]);
  const pagination=usePagination(filtered,`${search}|${filter}`);
  const current=items.find(item=>item.id===selected);
  function open(item:Application){setSelected(item.id);setReference('');setPaid(false);setCompany('auto');setReason('');setDecision('approve');setNotice('');setError('');}
  async function review(action:'approve'|'reject'|'activate'|'retry_notification'){
    if(!current||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const result=await apiRequest<{status:string}>(`/platform/admin/access-requests/${current.id}`,{method:'POST',body:JSON.stringify({action,payment_confirmed:paid,payment_reference:reference,target_company_id:company,rejection_reason:reason})});
      setReference('');setPaid(false);setCompany('auto');setReason('');setDecision('approve');
      
      setNotice(action==='activate'?(result.status==='active'?'Acceso habilitado. Consulta abajo el estado del correo.':'Solicitud aprobada. Estamos preparando la cuenta de la empresa; el acceso se habilitará automáticamente.'):action==='approve'?'Solicitud aprobada. Completa la habilitación del acceso.':action==='reject'?'Solicitud rechazada. Consulta abajo el estado del correo.':'Reintento realizado. Consulta el estado del correo.');
      await load();
      await onReviewed?.();
    }catch(problem){setError(problem instanceof Error?problem.message:'No se pudo guardar la revisión.');}
    finally{setSaving(false);}
  }
  const messages=<>{error&&<p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice&&<p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}</>;

  const dismiss=async()=>{if(saving||!await confirmDiscard())return;setSelected(null);setNotice('');setError('');setReference('');setPaid(false);setCompany('');setReason('');setDecision('approve');onDismiss?.();};
  if(initialRequestId&&!current)return <ReviewModal className={styles.review} title="Solicitud de empresa" onClose={()=>void dismiss()}><p role="status" className="py-8 text-center text-sm text-slate-500">{loading?'Cargando datos de la empresa...':error||'La solicitud ya no está disponible.'}</p></ReviewModal>;
  if(current)return <ReviewModal className={styles.review} title="Validar empresa" busy={saving} onClose={()=>void dismiss()}><div className="grid gap-6">
    <div><button type="button" disabled={saving} onClick={()=>void dismiss()} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-sabero-electric"><ArrowLeft className="h-4 w-4"/>Todas las solicitudes</button><div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Revisión de empresa</p><h2 ref={heading} tabIndex={-1} className="mt-2 text-2xl font-bold tracking-tight text-sabero-navy outline-none">{current.business_name}</h2></div><Badge status={current.status}/></div></div>
    {messages}
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
      <div className="grid gap-6"><Panel><div className="mb-6 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-sabero-electric"><Building2 className="h-6 w-6"/></span><div><h3 className="font-bold text-sabero-navy">Datos de contacto</h3><p className="text-xs text-slate-400">Recibida el {new Date(current.created_at).toLocaleDateString('es')}</p></div></div><p className="text-lg font-semibold text-sabero-navy">{current.contact_name}</p><a href={`mailto:${current.email}`} className="mt-4 flex items-center gap-3 break-all text-sm text-slate-600 hover:text-sabero-electric"><Mail className="h-4 w-4 shrink-0"/>{current.email}</a><p className="mt-4 flex items-center gap-3 text-sm text-slate-600"><Phone className="h-4 w-4 shrink-0"/>{current.phone}</p>{current.phone_country&&<p className="mt-3 pl-7 text-xs text-slate-400">{new Intl.DisplayNames(['es'],{type:'region'}).of(current.phone_country)}</p>}{(()=>{const chosen=publicPlans.find(item=>item.id===current.plan);const digits=current.phone.replace(/\D/g,'');const text=`Hola ${current.contact_name}, soy del equipo de SABERO AI. Recibimos la solicitud de ${current.business_name}${chosen?` para el plan ${chosen.name} (US$${chosen.price}/mes)`:''}. Para activar tu acceso, coordinemos el pago. ¿Te comparto los datos?`;return <div className="mt-6 border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">Plan elegido</p><p className="mt-1 text-sm font-semibold text-sabero-navy">{chosen?`${chosen.name} — US$${chosen.price}/mes`:'Sin plan elegido'}</p><a href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:brightness-95"><BrandIcon id="whatsapp" color="#fff" className="h-4 w-4"/>Escribir por WhatsApp</a></div>;})()}{current.payment_reference&&<div className="mt-6 border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">Referencia de pago</p><p className="mt-1 break-words text-sm font-medium">{current.payment_reference}</p></div>}</Panel>
      <Panel><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-sabero-electric"/><h3 className="font-semibold text-sabero-navy">Notificación por correo</h3></div><p className="mt-4 text-sm font-semibold text-slate-700">{mailLabel(current)}</p><p className="mt-2 text-sm leading-6 text-slate-500">{current.notification?.status==='sent'?'Brevo aceptó el mensaje. La entrega en la bandeja del destinatario depende del proveedor de correo.':current.notification?.status==='failed'?'La decisión está guardada. No se pudo enviar el correo; se reintentará automáticamente o puedes reintentarlo ahora.':current.notification?.status==='skipped'?'Las direcciones de prueba no reciben correos reales.':'Se notificará a la empresa al aprobar, habilitar el acceso o rechazar su solicitud.'}</p>{current.notification?.sent_at&&<p className="mt-3 text-xs text-slate-400">{new Date(current.notification.sent_at).toLocaleString('es')}</p>}{current.notification?.status==='failed'&&<Button variant="ghost" className="mt-4" disabled={saving} onClick={()=>void review('retry_notification')}><RefreshCw className="mr-2 h-4 w-4"/>Reintentar correo</Button>}</Panel></div>
      <Panel><div className="mb-6 flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-sabero-electric"/><h3 className="text-lg font-bold text-sabero-navy">{current.status==='pending'?'Revisar solicitud':current.status==='approved'?'Habilitar acceso':'Resultado de la revisión'}</h3></div>
        {['pending','approved'].includes(current.status)?<>
          <div className="mb-6 grid grid-cols-2 gap-3"><button type="button" disabled={saving} aria-pressed={decision==='approve'} onClick={()=>setDecision('approve')} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${decision==='approve'?'border-blue-300 bg-blue-50 text-blue-700':'border-slate-200 text-slate-500'}`}><Check className="h-4 w-4"/>{current.status==='pending'?'Aprobar':'Habilitar'}</button><button type="button" disabled={saving} aria-pressed={decision==='reject'} onClick={()=>setDecision('reject')} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${decision==='reject'?'border-rose-300 bg-rose-50 text-rose-700':'border-slate-200 text-slate-500'}`}><X className="h-4 w-4"/>Rechazar</button></div>
          {decision==='reject'?<div className="grid gap-5"><label className="text-sm font-semibold text-slate-700">Motivo para la empresa <span className="font-normal text-slate-400">· opcional</span><textarea maxLength={1000} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Escribe una explicación breve" className={`${field} min-h-28 resize-y`}/></label><p className="text-xs leading-5 text-slate-500">Este texto se incluirá en el correo. La solicitud quedará rechazada.</p><Button variant="danger" disabled={saving||loading} onClick={()=>void review('reject')}>{saving?'Guardando…':'Rechazar y notificar'}</Button></div>
          :current.status==='pending'?<div className="grid gap-5"><p className="text-sm leading-6 text-slate-500">Confirma el pago para aprobar la solicitud. Después podrás habilitar el acceso de esta empresa.</p><label className="text-sm font-semibold text-slate-700">Referencia del pago<input value={reference} maxLength={200} onChange={event=>setReference(event.target.value)} placeholder="Número de operación o comprobante" className={field}/></label><label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><input type="checkbox" checked={paid} onChange={event=>setPaid(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-blue-600"/>He verificado el pago de esta empresa.</label><Button disabled={saving||loading||!paid||!reference.trim()} onClick={()=>void review('approve')}>{saving?'Guardando…':'Aprobar y notificar'}</Button></div>
          :<div className="grid gap-5"><p className="text-sm leading-6 text-slate-500">Vincula una cuenta existente o crea una nueva para esta empresa. Se conservará la contraseña que eligió al registrarse.</p><label className="text-sm font-semibold text-slate-700">Empresa<select aria-label="Empresa" value={company} onChange={event=>setCompany(event.target.value)} className={field}><option value="auto">Crear empresa nueva automáticamente</option>{companies.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{company==='auto'?<p className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">Se preparará una cuenta independiente para «{current.business_name}»: su base de datos, su agente y un propietario con la contraseña del registro. El acceso se habilitará solo cuando termine la preparación.</p>:!companies.length?<p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No hay cuentas preparadas. Elige «Crear empresa nueva automáticamente» o prepara una cuenta independiente antes.</p>:null}<p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-800">{current.has_password?'La empresa ya definió su contraseña al registrarse. No puedes verla ni cambiarla desde esta revisión.':'Esta solicitud antigua no tiene una contraseña registrada. Rechaza la solicitud y pide a la empresa que vuelva a registrarse con su propia contraseña.'}</p><Button disabled={saving||loading||!company||!current.has_password} onClick={()=>void review('activate')}>{saving?'Habilitando…':'Habilitar acceso y notificar'}</Button></div>}
        </>:<div className="rounded-2xl bg-slate-50 p-5"><div className="flex items-center gap-3">{current.status==='active'?<CheckCircle2 className="h-6 w-6 text-emerald-600"/>:<X className="h-6 w-6 text-rose-600"/>}<p className="font-semibold text-sabero-navy">{current.status==='active'?'La empresa ya tiene acceso':'La solicitud fue rechazada'}</p></div>{current.company_id&&<p className="mt-3 text-sm text-slate-500">Empresa vinculada: {current.company_id}</p>}{current.rejection_reason&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{current.rejection_reason}</p>}</div>}
      </Panel>
    </div>
  </div></ReviewModal>;

  return <AccessRequestList items={items} filtered={filtered} pagination={pagination} loading={loading} search={search} filter={filter} labels={labels} messages={messages} setSearch={setSearch} setFilter={setFilter} load={load} open={open} renderStatus={status=><Badge status={status}/>} notificationLabel={mailLabel}/>;
}
