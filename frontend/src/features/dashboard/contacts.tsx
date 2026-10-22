'use client';

import { useEffect, useMemo, useState } from 'react';
import { DeleteRecordButton, Pagination, usePagination } from '@/components/list-controls';
import { Search, Users } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Panel, Button } from '@/components/ui';

type Contact = { id: string; name: string | null; whatsapp_number: string; status: string; conversations_count: number; last_message_at: string | null; qualification?: { email?: string } };

export function Contacts() {
  const [items, setItems] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError('');
    try { setItems(await apiRequest<Contact[]>('/leads?limit=200')); }
    catch { setError('No se pudieron cargar los contactos. Vuelve a intentarlo.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => items.filter(item => `${item.name || ''} ${item.whatsapp_number} ${item.status} ${item.qualification?.email || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [items, search]);
  const pagination = usePagination(filtered, search);
  return <Panel>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-xl font-bold text-sabero-navy">Contactos de tu empresa</h2><p className="mt-1 text-sm text-slate-500">Personas que han conversado con tu agente. Hasta 200 contactos recientes.</p></div>
      <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualizar</Button>
    </div>
    <label className="my-6 flex max-w-md items-center gap-3 rounded-xl border border-slate-200 px-4 py-3"><Search className="h-4 w-4 text-slate-400"/><input aria-label="Buscar contactos" className="w-full bg-transparent text-sm outline-none" placeholder="Buscar por nombre, WhatsApp o estado" value={search} onChange={event => setSearch(event.target.value)}/></label>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : loading ? <p role="status" className="py-12 text-center text-slate-500">Cargando contactos…</p> : !filtered.length ? <div className="py-12 text-center text-slate-500"><Users className="mx-auto mb-3 h-8 w-8"/><p>{search ? 'No hay coincidencias.' : 'Cuando un cliente escriba, aparecerá aquí.'}</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wider text-slate-500"><tr>{['Contacto', 'WhatsApp', 'Estado', 'Conversaciones', 'Último mensaje', 'Acciones'].map(label => <th key={label} className="px-3 py-4 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{pagination.items.map(item => <tr key={item.id} className="hover:bg-slate-50"><td className="px-3 py-5 font-semibold text-sabero-navy">{item.name || 'Sin nombre'}<span className="mt-1 block text-xs font-normal text-slate-500">{item.qualification?.email || 'Correo pendiente'}</span></td><td className="px-3 py-5">{item.whatsapp_number}</td><td className="px-3 py-5"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700">{item.status}</span></td><td className="px-3 py-5">{item.conversations_count}</td><td className="whitespace-nowrap px-3 py-5 text-slate-500">{item.last_message_at ? new Date(item.last_message_at).toLocaleString('es-PE') : 'Sin mensajes'}</td><td className="px-3 py-5"><DeleteRecordButton resource="contacts" id={item.id} name={item.name || item.whatsapp_number} reload={load}/></td></tr>)}</tbody></table></div>}
    <Pagination {...pagination} label="contactos"/>
  </Panel>;
}
