'use client';

import { DeleteRecordButton, Pagination, usePagination } from '@/components/list-controls';
import { useCallback, useEffect, useState } from 'react';
import { Cloud, FileText, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { DriveFile } from '@/lib/types';
import { Button, Panel, StatusPill } from '@/components/ui';
import type { PickerConfig, PickerDocument, TokenClient } from '@/lib/integrations';

export function Knowledge({ companyId, files, reload, pushLog }: { companyId: string; files: DriveFile[]; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [pickerConfig, setPickerConfig] = useState<PickerConfig | null>(null);
  const [pickerReady, setPickerReady] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [tokenClient, setTokenClient] = useState<TokenClient | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dataConsent,setDataConsent] = useState(false);
  const [pickerError,setPickerError] = useState('');
  const [pickerAttempt,setPickerAttempt] = useState(0);

  const handlePickerSelection = useCallback(async (data: { action: string; docs?: PickerDocument[] }) => {
    if (data.action !== window.google.picker.Action.PICKED) {
      setPickerBusy(false);
      return;
    }

    for (const doc of data.docs || []) {
      await apiRequest('/google-drive/files', {
        method: 'POST',
        body: JSON.stringify({
          company_id: companyId,
          google_file_id: doc.id,
          name: doc.name,
          mime_type: doc.mimeType,
          web_view_link: doc.url,
        }),
      });
      pushLog(`Documento autorizado: ${doc.name}.`);
    }

    setPickerBusy(false);
    await reload(companyId);
  }, [companyId, pushLog, reload]);

  const openPicker = useCallback((config: PickerConfig, token: string) => {
    const view = new window.google.picker.DocsView()
      .setIncludeFolders(false)
      .setMimeTypes([
        'application/pdf',
        'application/vnd.google-apps.document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].join(','));

    new window.google.picker.PickerBuilder()
      .setDeveloperKey(config.developer_key)
      .setAppId(config.app_id)
      .setOrigin(window.location.origin)
      .setOAuthToken(token)
      .setCallback((data: { action: string; docs?: PickerDocument[] }) => {
        void handlePickerSelection(data);
      })
      .addView(view)
      .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
      .build()
      .setVisible(true);
  }, [handlePickerSelection]);

  const waitForGoogleLibraries = useCallback((config: PickerConfig, cancelledRef: { current: boolean }) => {
    const timeout=window.setTimeout(()=>{
      window.clearInterval(timer);
      if(!cancelledRef.current)setPickerError('No se pudo cargar el selector de Google. Revisa tu conexión o los bloqueadores del navegador y vuelve a intentarlo.');
    },20000);
    const timer = window.setInterval(() => {
      if (cancelledRef.current) {
        window.clearInterval(timer);
        return;
      }

      if (!window.google?.accounts?.oauth2 || !window.gapi) return;

      window.clearInterval(timer);
      window.gapi.load('picker', () => {
        if(cancelledRef.current)return;
        window.clearTimeout(timeout);
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.client_id,
          scope: config.scopes.join(' '),
          callback: (response: { access_token?: string; error?: string }) => {
            if (response.error || !response.access_token) {
              pushLog(`Google Picker no entrego token: ${response.error || 'sin token'}.`);
              setPickerBusy(false);
              setPickerError('Google no autorizó el acceso a Drive. Vuelve a intentarlo con la cuenta de tu empresa.');
              return;
            }

            setAccessToken(response.access_token);
            setPickerError('');
            openPicker(config, response.access_token);
          },
          error_callback:()=>{setPickerBusy(false);},
        });

        setTokenClient(client);
        setPickerError('');
        setPickerReady(true);
        pushLog('Google Picker listo para seleccionar documentos.');
      });
    }, 200);
    return ()=>{window.clearInterval(timer);window.clearTimeout(timeout);};
  }, [pushLog, openPicker]);

  useEffect(() => {
    const cancelledRef = { current: false };
    let stopWaiting:(()=>void)|undefined;
    setPickerConfig(null);setPickerError('');setPickerReady(false);setTokenClient(null);setAccessToken('');

    async function loadPicker() {
      const config = await apiRequest<PickerConfig>(`/integrations/google/picker-config?company_id=${companyId}`,{cache:'no-store'});
      if (cancelledRef.current) return;
      setPickerConfig(config);

      if (!config.enabled || !config.client_id) {
        setPickerError('La conexión de documentos necesita una revisión de configuración. Contacta al administrador.');
        return;
      }

      stopWaiting=waitForGoogleLibraries(config, cancelledRef);
    }

    void loadPicker().catch(()=>{if(!cancelledRef.current)setPickerError('No se pudo consultar la conexión con Google. Vuelve a intentarlo.');});

    return () => {
      cancelledRef.current = true;
      stopWaiting?.();
    };
  }, [companyId, pushLog, waitForGoogleLibraries,pickerAttempt]);

  function selectFiles() {
    if (!dataConsent) return;
    if (!pickerConfig?.enabled || !tokenClient || !pickerReady) {
      pushLog('Google Picker todavia no esta listo.');
      return;
    }

    setPickerBusy(true);
    tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  }

  async function syncAll() {
    if (!files.length) {
      pushLog('Primero selecciona documentos de Drive; no hay archivos para sincronizar.');
      return;
    }

    setSyncing(true);
    try {
      await apiRequest(`/google-drive/sync?company_id=${companyId}`, { method: 'POST' });
      pushLog('Sincronizacion Drive ejecutada.');
      await reload(companyId);
    } finally {
      setSyncing(false);
    }
  }
  const pagination=usePagination(files);
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">RAG comercial</p>
          <h2 className="mt-2 text-3xl font-black text-sabero-navy">Documentos autorizados</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={selectFiles} disabled={!dataConsent || !pickerReady || pickerBusy}>
            <Cloud className="mr-2 h-4 w-4" />{pickerBusy ? 'Abriendo Drive...' : 'Seleccionar documentos'}
          </Button>
          <Button variant="ghost" onClick={syncAll} disabled={!dataConsent || syncing}>
            <RefreshCw className="mr-2 h-4 w-4" />{syncing ? 'Sincronizando...' : 'Sincronizar Drive'}
          </Button>
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700"><p>El texto de los archivos seleccionados se guardará como conocimiento del agente. Sus fragmentos relevantes pueden enviarse a DeepSeek para generar respuestas y mostrarse a tus clientes por WhatsApp. No selecciones contenido confidencial ni datos que no estés autorizado a comunicar. <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-sabero-electric underline">Política de privacidad</a>.</p><label className="mt-3 flex items-start gap-3"><input type="checkbox" className="mt-1" checked={dataConsent} onChange={event=>setDataConsent(event.target.checked)}/><span>Autorizo este uso de los documentos que seleccione.</span></label></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          ['1', 'Selecciona documentos', 'PDF, Google Docs o DOCX desde Drive.'],
          ['2', 'Autoriza acceso', 'Google permite leer solo archivos elegidos.'],
          ['3', 'Sincroniza RAG', 'Se indexan fragmentos para responder sin inventar.'],
        ].map(([step, title, text]) => (
          <div key={step} className="rounded-2xl border border-sabero-electric/20 bg-blue-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sabero-electric">Paso {step}</p>
            <h3 className="mt-2 font-black text-sabero-navy">{title}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-600">{text}</p>
          </div>
        ))}
      </div>
      {pickerError?<div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><p>{pickerError}</p><Button variant="ghost" onClick={()=>setPickerAttempt(value=>value+1)}>Reintentar conexión</Button></div>:!pickerReady&&<p role="status" className="mt-4 text-sm text-slate-500">Preparando el selector de Google…</p>}
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        {files.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto h-10 w-10 text-sabero-electric" />
            <p className="mt-3 font-black text-sabero-navy">Todavia no hay documentos autorizados.</p>
            <p className="mt-2 text-sm font-semibold text-slate-500">Primero usa “Seleccionar documentos”; luego presiona “Sincronizar Drive”.</p>
          </div>
        ) : pagination.items.map((file) => (
          <div key={file.id} className="flex items-center justify-between border-b border-slate-200 p-4 last:border-0">
            <div>
              <p className="font-black text-sabero-navy">{file.name}</p>
              <p className="text-sm text-slate-500">{file.mime_type}</p>
            </div>
            <div className="flex items-center gap-2"><StatusPill active={file.sync_status === 'indexed'} label={file.sync_status}/><DeleteRecordButton resource="files" id={file.id} name={file.name} reload={()=>reload(companyId)}/></div>
          </div>
        ))}
      </div>
      <Pagination {...pagination} label="documentos"/>
    </Panel>
  );
}


