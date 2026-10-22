'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';
import { Panel, Button } from '@/components/ui';

type Usage = { requests: number; measured_requests: number; input_tokens: string; output_tokens: string; total_tokens: string; first_recorded_at: string | null };
export function Usage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { setUsage(await apiRequest<Usage>('/dashboard/usage')); }
    catch { setError('No se pudo cargar el consumo. Vuelve a intentarlo.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const number = (value: number | string | undefined) => value === undefined ? '—' : Number(value).toLocaleString('es-PE');
  return <><Panel><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-sabero-navy">Consumo de inteligencia artificial</h2><p className="mt-1 text-sm text-slate-500">Mes actual · DeepSeek · Solo tu empresa</p></div><Button variant="ghost" disabled={loading} onClick={() => void load()}>Actualizar</Button></div>{error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Llamadas a la IA', usage?.requests], ['Tokens de entrada', usage?.input_tokens], ['Tokens de salida', usage?.output_tokens], ['Tokens totales', usage?.total_tokens]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 p-5"><p className="text-sm text-slate-500">{label}</p><strong className="mt-3 block text-3xl text-sabero-navy">{number(value)}</strong></div>)}</div>
    <p className="mt-6 text-sm text-slate-500">{usage?.first_recorded_at ? `Primer registro de este mes: ${new Date(usage.first_recorded_at).toLocaleString('es-PE')}. ${usage.measured_requests} de ${usage.requests} llamadas incluyen el total de tokens.` : 'El registro comienza con esta actualización. Los consumos anteriores no están disponibles.'}</p>
    </Panel><Panel><h3 className="font-bold text-sabero-navy">Cómo interpretar el consumo</h3><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Un mensaje puede requerir varias llamadas: interpretar la intención, consultar la agenda y redactar la respuesta. Los tokens corresponden a los valores informados por el proveedor. El importe facturado se consulta en DeepSeek; este panel todavía no calcula costos.</p></Panel></>;
}
