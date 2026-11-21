'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight, Building2, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { DeleteRecordButton, Pagination } from '@/components/list-controls';
import type { Application } from './access-requests';
import shared from './platform-console.module.css';
import styles from './access-requests.module.css';

type Props = {
  items: Application[];
  filtered: Application[];
  pagination: Parameters<typeof Pagination>[0] & { items: Application[] };
  loading: boolean;
  search: string;
  filter: string;
  labels: Record<string, string>;
  messages: ReactNode;
  setSearch: (value: string) => void;
  setFilter: (value: string) => void;
  load: () => Promise<void>;
  open: (item: Application) => void;
  renderStatus: (status: string) => ReactNode;
  notificationLabel: (item: Application) => string;
};

const indicators = [
  { status: 'pending', label: 'Por revisar', description: 'Solicitudes pendientes de revisión', Icon: Clock3 },
  { status: 'approved', label: 'Por habilitar', description: 'Aprobadas, pendientes de acceso', Icon: ShieldCheck },
  { status: 'active', label: 'Habilitadas', description: 'Empresas con acceso concedido', Icon: CheckCircle2 },
];

export function AccessRequestList({ items, filtered, pagination, loading, search, filter, labels, messages, setSearch, setFilter, load, open, renderStatus, notificationLabel }: Props) {
  return (
    <div className={`${shared.console} ${styles.page}`}>
      <header className={shared.heading}>
        <div>
          <p className={shared.eyebrow}>GESTIÓN DE ACCESOS</p>
          <h1>Solicitudes de acceso<span>.</span></h1>
          <p className={shared.subtitle}>Revisa las empresas que quieren crecer contigo y gestiona su incorporación.</p>
        </div>
        <button type="button" className={shared.refresh} disabled={loading} onClick={() => void load()} aria-label="Actualizar solicitudes">
          <RefreshCw size={14} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />Actualizar
        </button>
      </header>

      {messages}

      <div className={styles.indicators} role="group" aria-label="Filtrar solicitudes por estado">
        {indicators.map(({ status, label, description, Icon }) => (
          <button key={status} type="button" className={styles.indicator} data-status={status} aria-pressed={filter === status} onClick={() => setFilter(filter === status ? 'all' : status)}>
            <span className={styles.indicatorLabel}>{label}<Icon size={18} strokeWidth={1.5} /></span>
            <strong>{loading ? '—' : items.filter(item => item.status === status).length}</strong>
            <span className={styles.indicatorNote}>{description}</span>
          </button>
        ))}
      </div>

      <section className={shared.panel} aria-labelledby="access-request-list-title">
        <div className={shared.sectionHeader}>
          <div>
            <p className={shared.eyebrow}>SOLICITUDES RECIBIDAS</p>
            <h2 id="access-request-list-title">Empresas que quieren crecer contigo<span className={shared.totalCount}>{filtered.length}</span></h2>
            <p className={styles.listDescription}>Selecciona una empresa para revisar su solicitud.</p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <label className={`${shared.search} ${styles.search}`}>
            <Search size={16} />
            <input aria-label="Buscar solicitudes" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar empresa, contacto o correo" />
          </label>
          <label className={styles.filter}>
            <span>Estado</span>
            <select aria-label="Estado de solicitudes" value={filter} onChange={event => setFilter(event.target.value)}>
              <option value="all">Todos los estados</option>
              {Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
        </div>

        {loading ? <p role="status" className={shared.empty}>Cargando solicitudes…</p> : !filtered.length ? (
          <div className={shared.empty}>
            <Building2 size={28} strokeWidth={1.3} />
            <p>{items.length ? 'No hay solicitudes con estos filtros.' : 'Las nuevas solicitudes de empresas aparecerán aquí.'}</p>
            {(search || filter !== 'all') && <button type="button" className={shared.detailButton} onClick={() => { setSearch(''); setFilter('all'); }}>Limpiar filtros</button>}
          </div>
        ) : (
          <div className={shared.tableScroll}>
            <table className={`${shared.table} ${styles.table}`}>
              <thead><tr>{['Empresa', 'Contacto', 'Estado', 'Notificación', 'Recibida', 'Acciones'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>
                {pagination.items.map(item => (
                  <tr key={item.id}>
                    <td><button type="button" aria-label={item.business_name} onClick={() => open(item)} className={`${shared.companyName} ${styles.company}`}><span className={styles.initials}>{item.business_name.slice(0, 2).toUpperCase()}</span><span>{item.business_name}</span></button></td>
                    <td><p className={styles.contactName}>{item.contact_name}</p><p className={styles.contactEmail}>{item.email}</p></td>
                    <td>{renderStatus(item.status)}</td>
                    <td className={styles.notification}>{notificationLabel(item)}</td>
                    <td className={styles.date}>{new Date(item.created_at).toLocaleDateString('es-PE')}</td>
                    <td><div className={shared.rowActions}><button type="button" onClick={() => open(item)} aria-label={`Revisar ${item.business_name}`} className={shared.detailButton}>Revisar<ArrowUpRight size={15} /></button><DeleteRecordButton resource="requests" id={item.id} name={item.business_name} reload={load} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination {...pagination} label="solicitudes" />
      </section>
    </div>
  );
}
