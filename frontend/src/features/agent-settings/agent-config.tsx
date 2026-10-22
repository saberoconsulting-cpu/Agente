'use client';

import { DeleteRecordButton, Pagination, usePagination } from '@/components/list-controls';
import { useEffect, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import type { AgentSettings } from '@/lib/types';
import { Button, Panel, StatusPill } from '@/components/ui';

export function AgentConfig({ companyId, settings, reload, pushLog }: { companyId: string; settings: AgentSettings | null; reload: (id?: string) => Promise<void>; pushLog: (m: string) => void }) {
  const [brief, setBrief] = useState(companyId === 'sabero' ? 'Somos SABERO Consulting. Vendemos software a medida, arquitectura cloud y automatizaciones con IA para empresas que quieren vender mas, operar mejor y escalar.' : '');
  const [rules, setRules] = useState(settings?.settings.system_rules || '');
  const [manualServiceName, setManualServiceName] = useState('');
  const [manualServiceDescription, setManualServiceDescription] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [savingScheduling, setSavingScheduling] = useState(false);
  useEffect(() => { setScheduling(Boolean(settings?.settings.scheduling_enabled)); }, [settings?.settings.scheduling_enabled]);

  async function saveScheduling() {
    setSavingScheduling(true);
    try {
      await apiRequest('/agent-settings', { method: 'PATCH', body: JSON.stringify({ scheduling_enabled: scheduling }) });
      await reload(companyId);
      pushLog(scheduling ? 'Agenda activada para esta empresa.' : 'Agenda desactivada: el agente atenderá sin proponer citas.');
    } catch { pushLog('No se pudo guardar la agenda. Vuelve a intentarlo.'); }
    finally { setSavingScheduling(false); }
  }

  useEffect(() => {
    setRules(settings?.settings.system_rules || '');
  }, [settings?.settings.system_rules]);

  async function generateFromBrief() {
    const cleanBrief = brief.trim();
    if (!cleanBrief) {
      pushLog('Escribe un briefing corto para configurar el agente.');
      return;
    }

    const generatedRules = [
      `Contexto del negocio: ${cleanBrief}`,
      'Vende con mensajes cortos: una idea y una pregunta por turno. Explica solo lo que el cliente necesite.',
      'Para cada servicio, explica la necesidad que resuelve, el cliente ideal, entregables posibles, valor economico y oportunidad comercial.',
      'Distingue claramente entre capacidades anunciadas y experiencia, certificaciones o resultados que todavia deban confirmarse.',
      'No inventes precios, garantias, casos de exito ni condiciones que no esten en la base de conocimiento o politicas comerciales.',
      scheduling ? 'Si ayuda al cliente, ofrece una reunion. Pide los datos de uno en uno.' : 'Ayuda a elegir el producto y avanzar hacia la compra sin proponer reuniones.',
      'Si falta informacion, responde con honestidad y ofrece que el equipo de esta empresa lo confirme.',
    ].join('\n');

    await apiRequest('/agent-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        company_id: companyId,
        agent_name: 'Asesor Comercial IA',
        tone: 'consultivo, claro, persuasivo y profesional',
        system_rules: generatedRules,
      }),
    });

    const serviceCandidates = [
      ['Software a medida', 'Diseño y desarrollo de plataformas web, dashboards, sistemas internos e integraciones empresariales.'],
      ['Arquitectura cloud', 'Diseño, despliegue y optimizacion de infraestructura escalable, segura y preparada para crecimiento.'],
      ['Automatizaciones con IA', 'Automatizacion de procesos comerciales y operativos usando agentes, RAG, integraciones y modelos de IA.'],
    ];

    for (const service of settings?.services || []) {
      await apiRequest(`/agent-settings/services/${service.id}?company_id=${companyId}`, {
        method: 'DELETE',
      });
    }

    for (const [name, description] of robustServicesFromBrief(cleanBrief, serviceCandidates)) {
      await apiRequest('/agent-settings/services', {
        method: 'POST',
        body: JSON.stringify({ company_id: companyId, name, description, active: true }),
      });
    }

    setRules(generatedRules);
    pushLog('Agente comercial configurado desde el briefing.');
    await reload(companyId);
  }

  async function saveRules() {
    await apiRequest('/agent-settings', {
      method: 'PATCH',
      body: JSON.stringify({
        company_id: companyId,
        system_rules: rules,
      }),
    });
    pushLog('Reglas del agente actualizadas.');
    await reload(companyId);
  }

  async function deleteService(id: string, name: string) {
    await apiRequest(`/agent-settings/services/${id}?company_id=${companyId}`, {
      method: 'DELETE',
    });
    pushLog(`Servicio eliminado: ${name}.`);
    await reload(companyId);
  }

  async function addManualService() {
    const name = manualServiceName.trim();
    const description = manualServiceDescription.trim();
    if (!name || !description) {
      pushLog('Completa nombre y descripcion del servicio manual.');
      return;
    }

    await apiRequest('/agent-settings/services', {
      method: 'POST',
      body: JSON.stringify({ company_id: companyId, name, description, active: true }),
    });
    setManualServiceName('');
    setManualServiceDescription('');
    pushLog(`Servicio agregado manualmente: ${name}.`);
    await reload(companyId);
  }
  const pagination=usePagination(settings?.services || []);
  return (
    <div className="grid gap-6">
      <Panel><h2 className="text-xl font-bold text-sabero-navy">¿Tu negocio necesita citas?</h2><p className="mt-2 text-sm text-slate-500">Opcional. Para vender productos puedes atender sin Calendar. Al activar la agenda, conecta Google antes de ofrecer horarios.</p><label className="my-5 flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={scheduling} onChange={event => setScheduling(event.target.checked)} className="h-5 w-5" />Permitir reuniones y citas</label><Button onClick={() => void saveScheduling()} disabled={!settings || savingScheduling}>{savingScheduling ? 'Guardando…' : 'Guardar agenda'}</Button></Panel>
      <Panel>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Configurar con IA</p>
        <h2 className="mt-2 text-3xl font-black text-sabero-navy">Describe tu negocio y preparamos el vendedor</h2>
        <textarea
          className="mt-5 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-sabero-navy outline-none focus:border-sabero-electric"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder="Ejemplo: vendemos software a medida para inmobiliarias, automatizamos ventas por WhatsApp y agendamos demos..."
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={generateFromBrief}><Bot className="mr-2 h-4 w-4" />Generar configuracion</Button>
          <StatusPill active={Boolean(settings?.settings.system_rules)} label={settings?.settings.system_rules ? 'Config editable' : 'Pendiente'} />
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Prom comercial</p>
            <h3 className="mt-2 text-2xl font-black text-sabero-navy">{settings?.settings.agent_name || 'Agente comercial IA'}</h3>
          </div>
          <Button variant="ghost" onClick={saveRules}>Guardar edicion</Button>
        </div>
        <textarea
          className="mt-5 min-h-56 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-sabero-navy outline-none focus:border-sabero-electric"
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder="Aqui quedaran las reglas comerciales del agente. Puedes editarlas manualmente."
        />
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Servicios detectados</p>
            <h3 className="mt-2 text-xl font-black text-sabero-navy">Lo que el agente puede vender</h3>
          </div>
          <StatusPill active={Boolean(settings?.services.length)} label={`${settings?.services.length || 0} servicios`} />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[0.7fr_1.3fr_auto]">
          <input
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric"
            placeholder="Agregar servicio manual"
            value={manualServiceName}
            onChange={(event) => setManualServiceName(event.target.value)}
          />
          <input
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-sabero-electric"
            placeholder="Descripcion comercial del servicio"
            value={manualServiceDescription}
            onChange={(event) => setManualServiceDescription(event.target.value)}
          />
          <Button onClick={addManualService}><Plus className="mr-2 h-4 w-4" />Agregar</Button>
        </div>
        <div className="mt-5 grid gap-3">
          {settings?.services.length ? pagination.items.map((service) => (
            <div key={service.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-black text-sabero-navy">{service.name}</p>
                <DeleteRecordButton resource="services" id={service.id} name={service.name} reload={()=>reload(companyId)}/>
              </div>
              <p className="mt-2 text-sm text-slate-600">{service.description}</p>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm font-bold text-slate-500">
              Escribe el prom del negocio y presiona “Generar configuracion”; aqui se listaran automaticamente los servicios detectados.
            </div>
          )}
        </div>
        <Pagination {...pagination} label="servicios"/>
      </Panel>
    </div>
  );
}

function robustServicesFromBrief(brief: string, fallback: string[][]) {
  const lines = brief
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const listItems = lines
    .map((line) => {
      const bulletMatch = line.match(/^[-*•‣–—]\s+(.+)$/);
      if (bulletMatch) return bulletMatch[1];

      const numberedMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (numberedMatch) return numberedMatch[1];

      return null;
    })
    .filter((value): value is string => Boolean(value))
    .map((line) => line.replace(/[.;:]$/, '').trim())
    .filter((line) => line.length > 3);
  const serviceNames = listItems.length ? listItems : extractServicePhraseList(brief);

  if (!serviceNames.length) return fallback;

  return Array.from(new Set(serviceNames)).map((name) => [
    name,
    [
      `Servicio de ${name}.`,
      'Debe venderse de forma consultiva: identificar la necesidad del prospecto, explicar entregables posibles y conectar el servicio con valor economico.',
      'Si el prospecto pide experiencia, certificaciones, precios o resultados especificos, confirmar solo lo que exista en la base de conocimiento o derivar a una reunion con SABERO.',
    ].join(' '),
  ]);
}

function extractServicePhraseList(brief: string) {
  const marker = brief.match(/(?:servicios|capacidades|areas de negocio|vende|ofrece)\s*:?\s*([\s\S]+)/i);
  const source = marker?.[1] || brief;

  return source
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .map((item) => item.replace(/^y\s+/i, '').replace(/[.;:]$/, '').trim())
    .filter((item) => item.length > 8)
    .filter((item) => !/^(para cada|distingue|identifica|explica|servicios y capacidades)/i.test(item));
}


