'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { Button, Panel } from '@/components/ui';

export type VisionStatus = {
  plan: string;
  plan_label: string;
  plan_price: number;
  unlimited: boolean;
  plans: { id: string; label: string; price: number; images: number; unlimited: boolean }[];
  mode: 'platform' | 'own';
  provider: string | null;
  has_own_key: boolean;
  platform_available: boolean;
  monthly_limit: number;
  platform_used: number;
  platform_remaining: number;
  own_used: number;
  month: string;
};

export function ImageReading({ pushLog }: { pushLog: (m: string) => void }) {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void apiRequest<VisionStatus>('/vision/settings').then(setStatus).catch(() => setError('No se pudo consultar la lectura de imágenes.'));
  }, []);

  async function run(action: () => Promise<VisionStatus>, done: string) {
    setBusy(true); setError(''); setMessage('');
    try { setStatus(await action()); setMessage(done); pushLog(done); setApiKey(''); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  const saveKey = () => run(() => apiRequest<VisionStatus>('/vision/settings/key', { method: 'PUT', body: JSON.stringify({ provider, api_key: apiKey }) }), 'Clave guardada. Tus imágenes se leen con tu propia cuenta.');
  const removeKey = () => run(() => apiRequest<VisionStatus>('/vision/settings/key', { method: 'DELETE' }), 'Clave eliminada. Vuelves a usar las imágenes incluidas en tu plan.');

  return (
    <Panel>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">Lectura de imágenes</p>
      <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-sabero-navy">Fotos que envían tus clientes</h2>
      <p className="mt-2 text-sm text-slate-500">El agente puede entender las fotos que llegan por WhatsApp y responder sobre lo que ve.</p>
      {status && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {status.mode === 'own'
            ? <p>Usas tu propia clave ({status.provider === 'openai' ? 'OpenAI' : 'Claude'}). Imágenes leídas este mes: <b>{status.own_used}</b>. El costo lo cobra tu proveedor.</p>
            : status.plan === 'none' || status.monthly_limit === 0
              ? <p><b>Todavía no se leen las fotos de tus clientes.</b> Tu empresa no tiene un plan con lectura de imágenes: pídelo a SABERO o conecta tu propia clave de OpenAI o Claude aquí abajo.</p>
              : <p>Plan <b>{status.plan_label}</b>: {status.unlimited ? 'lectura de imágenes sin preocuparte del conteo' : <>te quedan <b>{status.platform_remaining}</b> de <b>{status.monthly_limit}</b> imágenes este mes</>}.{!status.unlimited && status.platform_remaining === 0 && ' Ya usaste las del mes: el agente avisará al cliente que un asesor revisará su foto.'}</p>}
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
        <select aria-label="Proveedor" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={provider} onChange={event => setProvider(event.target.value)}>
          <option value="anthropic">Claude (Anthropic)</option>
          <option value="openai">OpenAI</option>
        </select>
        <input aria-label="API key" type="password" autoComplete="off" placeholder="Pega tu API key" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" value={apiKey} onChange={event => setApiKey(event.target.value)} />
        <Button disabled={busy || apiKey.trim().length < 20} onClick={() => void saveKey()}>{busy ? 'Validando…' : 'Usar mi clave'}</Button>
      </div>
      {status?.has_own_key && <Button variant="ghost" className="mt-3" disabled={busy} onClick={() => void removeKey()}>Quitar mi clave</Button>}
      <p className="mt-3 text-xs text-slate-500">La clave se valida antes de guardarse, se guarda cifrada y no se vuelve a mostrar.</p>
      {message && <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}
    </Panel>
  );
}
