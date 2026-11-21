'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, Cloud, ExternalLink, MessageCircle, RefreshCw, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button, Panel, StatusPill } from '@/components/ui';
import type { WhatsAppConnection, WhatsAppEmbeddedSignupConfig, WhatsAppSignupAssets } from '@/lib/integrations';
import { useUnsavedChanges } from '@/components/action-confirmation';
import { ImageReading } from './image-reading';

type GoogleStatus={connected:boolean;company_id?:string;connected_at?:string|null};
function describeGoogle(status:GoogleStatus){return `Empresa: ${status.company_id||'—'}${status.connected_at?` · conectado ${new Date(status.connected_at).toLocaleString('es-PE')}`:' · sin conexión guardada'}`;}

export function Links({ companyId, pushLog, reload, googleConnectionResult: oauthResult }: { companyId: string; pushLog: (m: string) => void; reload: () => void; googleConnectionResult?:{ok:boolean;message:string}|null }) {
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppEmbeddedSignupConfig | null>(null);
  const [whatsappConnections, setWhatsappConnections] = useState<WhatsAppConnection[]>([]);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  const [registrationPin, setRegistrationPin] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState('Pendiente de configuracion');
  const [crmEnabled, setCrmEnabled] = useState(false);
  const [googleConsent,setGoogleConsent] = useState(false);
  const [whatsappIssue,setWhatsappIssue]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [googleConnected,setGoogleConnected]=useState<boolean|null>(null);
  const [googleInfo,setGoogleInfo]=useState('');
  const [googleStatusError,setGoogleStatusError]=useState('');
  const [googleChecking,setGoogleChecking]=useState(false);
  const [googleCheck,setGoogleCheck]=useState<{ok:boolean;message:string}|null>(null);
  const pendingCodeRef = useRef<string | null>(null);
  const pendingAssetsRef = useRef<WhatsAppSignupAssets>({});
  const completingRef = useRef(false);
  const signupActiveRef = useRef(false);
  useUnsavedChanges('connection-in-progress',whatsappBusy);
  const googleConnectionResult = googleStatusError ? {ok:false,message:googleStatusError}
    : oauthResult?.ok ? googleConnected===null ? {ok:false,message:'Comprobando que la conexión de Google quedó guardada para esta empresa…'}
    : googleConnected ? oauthResult : {ok:false,message:'Google terminó la autorización, pero no hay una conexión guardada para esta empresa. Vuelve a conectar Google.'}
    : oauthResult;

  useEffect(() => {
    try{
      const params=new URLSearchParams(window.location.search);
      const result=params.get('google');
      if(result==='connected')setGoogleCheck({ok:true,message:'Google quedó conectado. Pulsa "Comprobar Google Calendar" para probarlo.'});
      else if(result==='error')setGoogleCheck({ok:false,message:`Google no quedó conectado${params.get('reason')?`: ${params.get('reason')}`:''}. Vuelve a pulsar "Conectar Google" y deja marcadas todas las casillas de permisos.`});
    }catch{/* no query string */}
    void refreshGoogle();
    try{ if(new URLSearchParams(window.location.search).has('google')) window.history.replaceState(null,'',window.location.pathname); }catch{/* keep url */}
    // Cards stay current when the person comes back to the tab (e.g. after Google or Meta windows).
    const onFocus=()=>{ if(document.visibilityState!=='hidden'){ void refreshGoogle(); void loadWhatsAppState().catch(()=>undefined); } };
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onFocus);
    void loadWhatsAppState().catch(error => failWhatsApp(error instanceof Error ? error.message : 'No se pudo consultar WhatsApp.'));
    void apiRequest<{ products: string[] }>('/platform/company')
      .then(company => setCrmEnabled(company.products.includes('crm')))
      .catch(() => setCrmEnabled(false));
    return () => { window.removeEventListener('focus',onFocus); document.removeEventListener('visibilitychange',onFocus); };
  }, []);

  const completeWhatsAppSignup = useCallback(async () => {
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
      setWhatsappStatus(connection.status === 'connected' ? 'WhatsApp conectado correctamente.' : 'Autorización guardada. Falta activar el número con un PIN de seis dígitos.');
      setWhatsappIssue('');
      pushLog(connection.status === 'connected' ? 'WhatsApp conectado.' : 'WhatsApp pendiente de activación del número.');
      reload();
    } catch (error) {
      failWhatsApp(error instanceof Error ? error.message : 'No se pudo completar WhatsApp.');
      pushLog('WhatsApp no pudo completar la conexion.');
    } finally {
      setWhatsappBusy(false);
      completingRef.current = false;
      signupActiveRef.current = false;
      pendingCodeRef.current = null;
      pendingAssetsRef.current = {};
    }
  }, [pushLog, reload]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!signupActiveRef.current) return;
      const payload = parseWhatsAppSignupMessage(event);
      if (!payload) return;

      if (payload.status === 'FINISH' || payload.event === 'FINISH' || payload.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        if (!payload.waba_id || !payload.phone_number_id) {
          signupActiveRef.current = false;
          pendingCodeRef.current = null;
          pendingAssetsRef.current = {};
          setWhatsappBusy(false);
          failWhatsApp('Meta no devolvió una única cuenta y número de WhatsApp. Selecciona una cuenta con su número y vuelve a conectar.');
          return;
        }
        pendingAssetsRef.current = {
          waba_id: payload.waba_id,
          phone_number_id: payload.phone_number_id,
        };
        setWhatsappStatus('Autorizacion recibida. Guardando conexion...');
        void completeWhatsAppSignup();
        return;
      }

      if (payload.status === 'CANCEL' || payload.event === 'CANCEL') {
        if (completingRef.current) return;
        signupActiveRef.current = false;
        pendingCodeRef.current = null;
        pendingAssetsRef.current = {};
        setWhatsappBusy(false);
        setWhatsappStatus('La conexión no se completó.');
        setWhatsappIssue('La ventana de Meta se cerró o se canceló antes de terminar. No se guardó ningún cambio. Puedes intentarlo nuevamente.');
        pushLog('WhatsApp Embedded Signup cancelado.');
      }
      if (payload.event === 'ERROR') {
        if (completingRef.current) return;
        signupActiveRef.current = false;
        pendingCodeRef.current = null;
        pendingAssetsRef.current = {};
        setWhatsappBusy(false);
        failWhatsApp('Meta no pudo completar la autorización. Revisa los permisos y la cuenta seleccionada.');
      }
    };

    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [completeWhatsAppSignup, pushLog]);

  useEffect(() => {
    if (!whatsappBusy || !signupActiveRef.current) return;
    const timeout = window.setTimeout(() => {
      if (!signupActiveRef.current || completingRef.current) return;
      signupActiveRef.current = false;
      pendingCodeRef.current = null;
      pendingAssetsRef.current = {};
      setWhatsappBusy(false);
      failWhatsApp('La autorización de Meta no terminó a tiempo. Puedes iniciar la conexión nuevamente.');
    }, 180000);
    return () => window.clearTimeout(timeout);
  }, [whatsappBusy]);

  const items = [
    ['WhatsApp Cloud API', 'Webhook, respuestas y seguimiento comercial.', Boolean(whatsappConnections.some(connection=>connection.status==='connected')||whatsappConfig?.server_configured), MessageCircle],
    ['Google Drive', 'Documentos autorizados para el conocimiento de tu agente.', googleConnected===true, Cloud],
    ['Google Calendar', 'Consulta disponibilidad y agenda reuniones.', googleConnected===true, CalendarClock],
    ['CRM inmobiliario', 'Contactos e historial compartidos cuando el producto esta habilitado.', crmEnabled, Zap],
  ] as const;

  async function loadWhatsAppState() {
    const [config, connections] = await Promise.all([
      apiRequest<WhatsAppEmbeddedSignupConfig>('/whatsapp/connections/embedded-signup/config'),
      apiRequest<WhatsAppConnection[]>('/whatsapp/connections'),
    ]);
    setWhatsappConfig(config);
    setWhatsappConnections(connections);
    setWhatsappIssue('');
    if (connections.some(connection => connection.status === 'connected')) {
      setWhatsappStatus('WhatsApp conectado.');
    } else if (connections.some(connection => connection.status === 'pending')) {
      setWhatsappStatus('Autorización guardada. Falta activar o comprobar el número.');
    } else if (config.server_configured) {
      setWhatsappStatus('WhatsApp conectado con el número configurado en el servidor.');
    } else if (!config.enabled) {
      setWhatsappStatus(`Falta configurar: ${config.missing.join(', ') || 'configuracion Meta'}.`);
    } else {
      setWhatsappStatus('Listo para conectar WhatsApp.');
    }
  }

  async function connectWhatsApp() {
    if (signupActiveRef.current) return;
    if (!whatsappConfig?.enabled || !whatsappConfig.config_id) {
      setWhatsappIssue('WhatsApp todavía no está listo para conectarse. Actualiza el estado o revisa la configuración de Meta e inténtalo de nuevo.');
      pushLog('WhatsApp Embedded Signup pendiente: falta config_id real de Meta.');
      return;
    }

    setWhatsappBusy(true);
    signupActiveRef.current = true;
    setWhatsappIssue('');
    setWhatsappStatus('Abriendo Meta...');
    pendingCodeRef.current = null;
    pendingAssetsRef.current = {};
    completingRef.current = false;

    try {
      await loadFacebookSdk(whatsappConfig.app_id, whatsappConfig.graph_api_version);
      window.FB?.login((response) => {
        if (!signupActiveRef.current) return;
        const code = response.authResponse?.code;
        if (!code) {
          if (completingRef.current) return;
          signupActiveRef.current = false;
          pendingCodeRef.current = null;
          pendingAssetsRef.current = {};
          setWhatsappBusy(false);
          setWhatsappStatus('La conexión no se completó.');
          setWhatsappIssue(response.status === 'not_authorized' ? 'Meta no autorizó la conexión. Revisa los permisos de la cuenta e inténtalo nuevamente.' : 'La ventana de Meta se cerró o el proceso quedó incompleto. No se guardó ningún cambio. Inténtalo de nuevo.');
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
          version: 'v5',
          features: [{ name: 'whatsapp_business_app_onboarding', enabled: false }],
        },
      });
    } catch (error) {
      signupActiveRef.current = false;
      setWhatsappBusy(false);
      failWhatsApp(error instanceof Error ? error.message : 'No se pudo iniciar Meta.');
    }
  }

  async function registerWhatsApp(connection: WhatsAppConnection, checkOnly = false) {
    if (whatsappBusy) return;
    setWhatsappBusy(true);
    setWhatsappIssue('');
    try {
      const updated = await apiRequest<WhatsAppConnection>(`/whatsapp/connections/${encodeURIComponent(connection.id)}/register`, {
        method: 'POST', body: JSON.stringify(checkOnly ? {} : { pin: registrationPin }),
      });
      setWhatsappConnections(current => current.map(item => item.id === updated.id ? updated : item));
      setRegistrationPin('');
      setWhatsappStatus('WhatsApp conectado y número activo en Meta.');
      pushLog('Meta confirmó la activación del número de WhatsApp.');
      reload();
    } catch (error) {
      setWhatsappIssue(error instanceof Error ? error.message : 'No se pudo activar el número.');
      setWhatsappStatus('La activación sigue pendiente.');
    } finally { setWhatsappBusy(false); }
  }

  function failWhatsApp(message:string){
    setWhatsappStatus('No se pudo conectar WhatsApp.');
    setWhatsappIssue(`${message} Inténtalo de nuevo.`);
  }

  async function refreshGoogle(){
    try{
      const status=await apiRequest<GoogleStatus>('/integrations/google/status',{cache:'no-store'});
      setGoogleConnected(status.connected);setGoogleInfo(describeGoogle(status));
      setGoogleStatusError('');
      return status.connected;
    }catch{
      setGoogleConnected(null);setGoogleInfo('');
      setGoogleStatusError('No se pudo consultar la conexión guardada de Google. Pulsa Actualizar para volver a comprobarla.');
      return null;
    }
  }

  async function refreshConnections(){
    setRefreshing(true);
    try{
      const results=await Promise.allSettled([loadWhatsAppState(),refreshGoogle()]);
      if(results[0].status==='rejected')throw results[0].reason;
      pushLog('Estado de vinculaciones actualizado.');reload();}
    catch(error){failWhatsApp(error instanceof Error?error.message:'No se pudo actualizar WhatsApp.');}
    finally{setRefreshing(false);}
  }

  function connectGoogle(){
    window.location.assign(`/api/v1/integrations/google/start?company_id=${encodeURIComponent(companyId)}`);
  }

  async function checkGoogle(){
    setGoogleChecking(true);setGoogleCheck(null);
    try {
      await refreshGoogle();
      setGoogleCheck(await apiRequest<{ok:boolean;message:string}>('/integrations/google/check'));
    }catch{setGoogleCheck({ok:false,message:'No se pudo comprobar Google Calendar. Inténtalo de nuevo.'});}
    finally{setGoogleChecking(false);}
  }

  return (
    <div className="grid gap-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Vinculaciones</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy">Canales del agente</h2>
          </div>
          <Button disabled={refreshing||whatsappBusy} onClick={() => void refreshConnections()}><RefreshCw className={`mr-2 h-4 w-4 ${refreshing?'animate-spin':''}`} />{refreshing?'Actualizando…':'Actualizar'}</Button>
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
                {name==='Google Calendar'&&googleInfo&&<p className="mt-1 text-xs text-slate-400">{googleInfo}</p>}
              </div>
            </div>
            <StatusPill active={active} label={name.startsWith('Google') ? googleConnected===null?'Sin comprobar':googleConnected?'Vinculado':'Sin vincular' : name==='CRM inmobiliario' ? active?'Habilitado':'No habilitado' : active?'Conectado':'Sin vincular'} />
          </Panel>
        ))}
      </div>
      <Panel>
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700"><h3 className="font-bold text-sabero-navy">Antes de conectar Google</h3><p>Drive permite usar los archivos que selecciones como conocimiento del agente. Sus fragmentos relevantes pueden enviarse a DeepSeek para redactar respuestas para tus clientes. Calendar permite consultar disponibilidad y crear reuniones confirmadas. La conexión es opcional.</p><p className="mt-2">Selecciona solo información autorizada para ese uso. Puedes revocar los permisos desde tu cuenta de Google; las copias ya indexadas se eliminan por separado. <a className="font-semibold text-sabero-electric underline" href="/privacy" target="_blank" rel="noopener noreferrer">Ver política de privacidad</a>.</p><label className="mt-3 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={googleConsent} onChange={event=>setGoogleConsent(event.target.checked)}/><span>He leído y autorizo el uso descrito de los datos de Google para las funciones que active.</span></label></div>
        {whatsappConnections.filter(connection => connection.status === 'pending').map(connection => <form key={connection.id} className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4" onSubmit={event => { event.preventDefault(); void registerWhatsApp(connection); }}>
          <h3 className="font-bold">Activar {connection.display_phone_number || connection.phone_number_id}</h3>
          <p className="mt-2 text-sm">Elige y conserva un PIN de seis dígitos para la verificación en dos pasos de WhatsApp. No es el código que recibiste por SMS. Si ya elegiste un PIN para este número, usa el mismo.</p>
          <label className="mt-3 block text-sm font-semibold">PIN de seis dígitos<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} required value={registrationPin} onChange={event => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="ml-3 rounded border border-slate-300 px-3 py-2" aria-label="PIN de verificación en dos pasos de WhatsApp" /></label>
          <div className="mt-3 flex flex-wrap gap-3"><Button type="submit" disabled={whatsappBusy || !/^\d{6}$/.test(registrationPin)}>Activar número</Button><Button type="button" variant="ghost" disabled={whatsappBusy} onClick={() => void registerWhatsApp(connection, true)}>Comprobar activación</Button></div>
        </form>)}
        <div className="flex flex-wrap gap-3">
          <Button onClick={connectWhatsApp} disabled={whatsappBusy || !whatsappConfig?.enabled}>
            <MessageCircle className="mr-2 h-4 w-4" />{whatsappBusy ? 'Conectando...' : 'Conectar WhatsApp'}
          </Button>
          <Button disabled={!googleConsent} onClick={connectGoogle}>
            <Cloud className="mr-2 h-4 w-4" />{googleConnected?'Reconectar Google':'Conectar Google (Drive y Calendar)'}
          </Button>
          <Button variant="ghost" disabled={googleChecking} onClick={()=>void checkGoogle()}><CalendarClock className="mr-2 h-4 w-4"/>{googleChecking?'Comprobando…':'Comprobar Google Calendar'}</Button>
          <Button
            variant="ghost"
            onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />Abrir Google Calendar
          </Button>
        </div>
        {googleCheck&&<div role={googleCheck.ok?'status':'alert'} className={`mt-4 border p-4 text-sm leading-6 ${googleCheck.ok?'border-blue-200 bg-blue-50 text-blue-900':'border-amber-200 bg-amber-50 text-amber-900'}`}>{googleCheck.message}</div>}
        <div role={whatsappIssue?'alert':'status'} className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${whatsappIssue?'border-rose-200 bg-rose-50 text-rose-800':whatsappConnections.some(connection=>connection.status==='connected')?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-slate-200 bg-slate-50 text-slate-600'}`}>
          <div className="flex items-start gap-3">{whatsappIssue?<AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/>:<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/>}<div className="min-w-0 flex-1"><p className="font-bold">{whatsappStatus}{whatsappConnections[0]&&<span className="ml-2 text-sabero-navy">{whatsappConnections[0].verified_name || whatsappConnections[0].display_phone_number || whatsappConnections[0].phone_number_id}</span>}</p>{whatsappIssue&&<p className="mt-1 font-normal leading-6">{whatsappIssue}</p>}</div></div>
          {whatsappIssue&&<Button variant="ghost" className="mt-4" disabled={whatsappBusy||refreshing} onClick={()=>void (whatsappConfig?.enabled?connectWhatsApp():refreshConnections())}><RefreshCw className="mr-2 h-4 w-4"/>Intentar de nuevo</Button>}
        </div>
        {googleConnectionResult&&<div role={googleConnectionResult.ok?'status':'alert'} className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 text-sm ${googleConnectionResult.ok?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex items-start gap-3">{googleConnectionResult.ok?<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0"/>:<AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/>}<p className="leading-6">{googleConnectionResult.message}</p></div>{!googleConnectionResult.ok&&<Button variant="ghost" disabled={!googleConsent} onClick={connectGoogle}><RefreshCw className="mr-2 h-4 w-4"/>Intentar de nuevo</Button>}</div>}
      </Panel>
      <ImageReading pushLog={pushLog} />
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
      waba_id: typeof parsed.data.waba_id === 'string' ? parsed.data.waba_id
        : Array.isArray(parsed.data.messaging_account_ids) && parsed.data.messaging_account_ids.length === 1 && typeof parsed.data.messaging_account_ids[0] === 'string'
          ? parsed.data.messaging_account_ids[0] : undefined,
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


