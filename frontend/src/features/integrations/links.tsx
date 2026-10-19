'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Cloud, ExternalLink, MessageCircle, RefreshCw, Zap } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button, Panel, StatusPill } from '@/components/ui';
import type { WhatsAppConnection, WhatsAppEmbeddedSignupConfig, WhatsAppSignupAssets } from '@/lib/integrations';

export function Links({ companyId, pushLog, reload }: { companyId: string; pushLog: (m: string) => void; reload: () => void }) {
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
  }, [pushLog, reload]);

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
  }, [completeWhatsAppSignup, pushLog]);

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


