'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { Button, Panel } from '@/components/ui';
import type { VisionStatus } from '@/features/integrations/image-reading';

export function ImageLimit({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [plan, setPlan] = useState('none');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const path = `/vision/admin/${encodeURIComponent(companyId)}`;

  useEffect(() => {
    setStatus(null); setMessage(''); setError('');
    void apiRequest<VisionStatus>(path).then(result => { setStatus(result); setPlan(result.plan); }).catch(() => setError('No se pudo consultar el plan de la empresa.'));
  }, [path]);

  async function save() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await apiRequest<VisionStatus>(`${path}/plan`, { method: 'PUT', body: JSON.stringify({ plan }) }); setStatus(result); setPlan(result.plan); setMessage('Plan guardado.'); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }

  return (
    <Panel>
      <h3 className="font-semibold text-sabero-navy">Plan mensual y lectura de imágenes</h3>
      {status && (
        <p className="mt-2 text-sm text-slate-600">
          Plan actual: <b>{status.plan_label}</b>{status.plan_price > 0 && <> (US${status.plan_price}/mes)</>}.{' '}
          {status.mode === 'own'
            ? <>Usa su propia clave ({status.provider}). Imágenes leídas este mes: <b>{status.own_used}</b>.</>
            : <>Imágenes usadas con tu clave este mes: <b>{status.platform_used}</b> de <b>{status.monthly_limit}</b>.</>}
        </p>
      )}
      {status && !status.platform_available && <p className="mt-2 text-xs text-amber-700">Falta configurar la clave de la plataforma (VISION_API_KEY) en el servidor.</p>}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">Plan
          <select className="min-h-11 min-w-72 rounded-xl border border-slate-200 px-3" value={plan} onChange={event => setPlan(event.target.value)} disabled={!status}>
            {(status?.plans ?? []).map(item => (
              <option key={item.id} value={item.id}>
                {item.label}{item.price > 0 ? ` — US$${item.price}/mes — ${item.unlimited ? 'imágenes ilimitadas' : `${item.images} imágenes`}` : ' — sin imágenes'}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={busy || !status || plan === status.plan} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar plan'}</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">El plan define cuántas imágenes puede leer con tu clave. Si la empresa pone la suya, no se descuenta. El plan Ilimitado tiene un tope de seguridad de {status?.plans.find(item => item.id === 'unlimited')?.images ?? 500} imágenes al mes.</p>
      {message && <p role="status" className="mt-2 text-sm font-semibold text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700">{error}</p>}
    </Panel>
  );
}
