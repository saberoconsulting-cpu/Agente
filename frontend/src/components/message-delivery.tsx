import { Check, CheckCheck, Clock3, CircleAlert } from 'lucide-react';

export function MessageDelivery({ status, confirmedSend, at }: { status?: string; confirmedSend?: boolean; at?: string }) {
  const state = status || (confirmedSend ? 'sent' : 'unknown');
  const label = ({ sent: 'Enviado', delivered: 'Entregado', read: 'Leído', failed: 'No se pudo entregar', unknown: 'Sin confirmación de envío' } as Record<string, string>)[state] || 'Estado desconocido';
  const Icon = state === 'read' || state === 'delivered' ? CheckCheck : state === 'failed' ? CircleAlert : state === 'sent' ? Check : Clock3;
  const title = at ? `${label} · ${new Date(at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}` : label;
  return <span role="img" aria-label={label} title={title} style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 5, color: state === 'read' ? '#168bdf' : state === 'failed' ? '#c43d4d' : '#667781' }}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span>;
}
