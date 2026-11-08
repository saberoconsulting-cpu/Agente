'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Bot, CalendarClock, Check, ChevronRight, GripVertical, LayoutGrid, MessageCircle, Plus, RefreshCw, Search, Sparkles, Target, Users, X } from 'lucide-react';
import { apiRequest, SessionUser } from '@/lib/api';
import type { Opportunity, OpportunityFollowupDraft } from '@/lib/types';
import { Button } from '@/components/ui';
import { DraftInbox } from '@/components/draft-inbox';
import { useActionConfirmation, useUnsavedChanges } from '@/components/action-confirmation';
import styles from './pipeline.module.css';

type Stage = { id: string; label: string };
type Configuration = { mode: 'services' | 'products'; stages: Stage[] };
type Activity = { id: string; content: string; created_at: string };
type Detail = Opportunity & { company_id: string; activities: Activity[]; proposals: { id: string; title: string; content: string }[] };
type Message = { id: string; direction: string; text_body?: string; created_at?: string };
type Contact = { id: string; name?: string; whatsapp_number: string };
const labels: Record<string, string> = { nuevo: 'Nuevos contactos', calificado: 'En conversación', reunion_propuesta: 'Por agendar', reunion_agendada: 'Esperando reunión', propuesta: 'En negociación', reservado: 'Reservados', pagado: 'Pagados', en_envio: 'En envío', ganado: 'Clientes ganados', perdido: 'No interesados' };
const colors: Record<string, string> = { nuevo: '#4594f4', calificado: '#8270df', reunion_propuesta: '#e8a23c', reunion_agendada: '#24a8a1', propuesta: '#cd79bc', reservado: '#e8a23c', pagado: '#24a8a1', en_envio: '#8270df', ganado: '#27a777', perdido: '#9aa6b6' };
const closed = (stage: string) => ['ganado', 'perdido'].includes(stage);
const shortDate = (date: string) => new Date(date).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
const failure = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la acción. Inténtalo de nuevo.';

export function Opportunities({ items, users, drafts, canOperate, reload, initialSelectedId }: { items: Opportunity[]; users: SessionUser[]; drafts: OpportunityFollowupDraft[]; canOperate: boolean; reload: () => Promise<void>; initialSelectedId?:string|null }) {
  const { confirmDiscard } = useActionConfirmation();
  const [cards, setCards] = useState(items);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initialSelectedId||null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<'conversation' | 'activity'>('conversation');
  const [note, setNote] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newStage, setNewStage] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  useUnsavedChanges('opportunity-editor', Boolean(note.trim() || contactId));
  const drawer = useRef<HTMLDialogElement>(null);
  const createDialog = useRef<HTMLDialogElement>(null);
  const imported = useRef(false);

  useEffect(() => setCards(items), [items]);
  useEffect(() => {
    if (!canOperate || imported.current) return;
    imported.current = true;
    apiRequest('/opportunities/import-contacts', { method: 'POST' })
      .then(() => apiRequest<Opportunity[]>('/opportunities')).then(setCards)
      .catch(err => { imported.current = false; setError(failure(err)); });
  }, [canOperate]);
  useEffect(() => {
    let active = true;
    apiRequest<Configuration>('/opportunities/pipeline').then(data => { if (active) setConfig(data); }).catch(err => { if (active) setError(failure(err)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || dragging || busy) return;
      apiRequest<Opportunity[]>('/opportunities').then(setCards).catch(() => setError('No se pudo actualizar el tablero. Tus datos siguen visibles.'));
    }, 15000);
    return () => clearInterval(timer);
  }, [dragging, busy]);
  useEffect(() => {
    if (!selected) { drawer.current?.close(); return; }
    drawer.current?.showModal();
    let active = true;
    setDetail(null); setMessages([]); setNote(''); setTab('conversation');
    apiRequest<Detail>(`/opportunities/${selected}`).then(async data => {
      if (!active) return;
      setDetail(data);
      if (data.conversation_id) {
        const page = await apiRequest<{ items: Message[] }>(`/conversations/${data.conversation_id}/messages/page?company_id=${encodeURIComponent(data.company_id)}&limit=100`);
        if (active) setMessages(page.items);
      }
    }).catch(err => { if (active) setError(failure(err)); });
    return () => { active = false; };
  }, [selected]);
  useEffect(() => {
    if (newStage) createDialog.current?.showModal(); else createDialog.current?.close();
  }, [newStage]);

  async function refresh() {
    setBusy(true); setError('');
    try { await reload(); setCards(await apiRequest<Opportunity[]>('/opportunities')); }
    catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function move(id: string, stage: string) {
    if (!canOperate || busy) return;
    const previous = cards;
    setBusy(true); setError(''); setOver(null);
    setCards(current => current.map(card => card.id === id ? { ...card, stage, score_signals: { ...card.score_signals, manual_stage: true } } : card));
    try {
      const changed = await apiRequest<Opportunity>(`/opportunities/${id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) });
      if (selected === id) setDetail(current => current ? { ...current, ...changed } : current);
      setNotice(`Movido a ${labels[stage] || stage}. Tú controlas su etapa; puedes reactivar la IA desde la ficha.`);
      await reload();
    } catch (err) { setCards(previous); setError(failure(err)); } finally { setBusy(false); }
  }
  async function changeMode(mode: Configuration['mode']) {
    setBusy(true); setError('');
    try { setConfig(await apiRequest<Configuration>('/opportunities/pipeline', { method: 'PATCH', body: JSON.stringify({ mode }) })); setNotice('Proceso guardado para tu empresa. Las tarjetas existentes se conservan.'); }
    catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function importChats() {
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ imported: number }>('/opportunities/import-contacts', { method: 'POST' });
      await reload(); setCards(await apiRequest<Opportunity[]>('/opportunities'));
      setNotice(`${result.imported} contactos incorporados. Los próximos chats aparecerán automáticamente.`);
    } catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function openCreate(stage: string) {
    setContactId(''); setNewStage(stage); setError('');
    try { setContacts(await apiRequest<Contact[]>('/leads?limit=200')); } catch (err) { setError(failure(err)); }
  }
  async function createCard(event: React.FormEvent) {
    event.preventDefault(); if (!contactId || !newStage) return;
    setBusy(true); setError('');
    try {
      const card = await apiRequest<Opportunity>('/opportunities', { method: 'POST', body: JSON.stringify({ lead_id: contactId }) });
      if (newStage !== card.stage) await apiRequest(`/opportunities/${card.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage: newStage }) });
      await reload(); setCards(await apiRequest<Opportunity[]>('/opportunities')); setContactId(''); setNewStage(null);
    } catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function saveNote(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !note.trim()) return;
    setBusy(true);
    try { setDetail(await apiRequest<Detail>(`/opportunities/${selected}/notes`, { method: 'POST', body: JSON.stringify({ content: note.trim() }) })); setNote(''); setNotice('Nota guardada.'); }
    catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function resume() {
    if (!selected) return;
    setBusy(true);
    try {
      const changed = await apiRequest<Opportunity>(`/opportunities/${selected}/automation`, { method: 'PATCH' });
      setDetail(current => current ? { ...current, ...changed } : current);
      await reload(); setNotice('La IA actualizará la etapa con los próximos mensajes.');
    } catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function assign(assigneeId: string) {
    if (!selected || !assigneeId) return;
    setBusy(true);
    try { await apiRequest(`/opportunities/${selected}/assign`, { method: 'PATCH', body: JSON.stringify({ assignee_id: assigneeId }) }); await reload(); setDetail(await apiRequest<Detail>(`/opportunities/${selected}`)); setNotice('Responsable asignado.'); }
    catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  async function closeDrawer(){if(!await confirmDiscard())return;setSelected(null);}
  async function closeCreate(){if(!await confirmDiscard())return;setContactId('');setNewStage(null);}

  const stages = useMemo(() => {
    const base = config?.stages || [];
    const extra = [...new Set(cards.map(card => card.stage))].filter(stage => !base.some(s => s.id === stage));
    return [...base, ...extra.map(id => ({ id, label: labels[id] || id }))];
  }, [config, cards]);
  const filtered = cards.filter(card => `${card.lead_name || ''} ${card.whatsapp_number} ${card.service_interest || ''} ${card.next_action || ''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (filter === 'all' || (filter === 'open' ? !closed(card.stage) : filter === 'manual' ? card.score_signals?.manual_stage === true : card.stage === filter)));
  const open = cards.filter(card => !closed(card.stage)).length;
  const meetingCount = cards.filter(card => ['reunion_propuesta', 'reunion_agendada'].includes(card.stage)).length;
  const reserved = cards.filter(card => ['reservado', 'pagado', 'en_envio'].includes(card.stage)).length;
  const won = cards.filter(card => card.stage === 'ganado').length;
  const selectedCard = cards.find(card => card.id === selected);

  return <div className={styles.page}>
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}><span /> TU GESTIÓN COMERCIAL</div><h2>De conversación a cliente<span>.</span></h2><p>Todos tus contactos, el siguiente paso siempre a la vista.</p></div>
      <div className={styles.headerActions}><Button variant="ghost" disabled={busy} onClick={() => void refresh()}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /><span>Actualizar</span></Button>{canOperate && <Button disabled={busy || !config} onClick={() => void openCreate('nuevo')}><Plus size={17} />Nueva oportunidad</Button>}</div>
    </header>

    <div className={styles.metrics}>
      {[{ label: 'CONTACTOS EN EL TABLERO', value: cards.length, icon: Users, foot: 'Tu cartera de oportunidades', color: '#3187ed' }, { label: 'CONVERSACIONES ABIERTAS', value: open, icon: MessageCircle, foot: 'Con un siguiente paso por dar', color: '#8370dd' }, { label: config?.mode === 'products' ? 'PEDIDOS EN PROCESO' : 'REUNIONES EN PROCESO', value: config?.mode === 'products' ? reserved : meetingCount, icon: CalendarClock, foot: config?.mode === 'products' ? 'Reservados, pagados o en envío' : 'Por coordinar o ya agendadas', color: '#df9e39' }, { label: 'CLIENTES GANADOS', value: won, icon: Target, foot: cards.length ? `${Math.round(won / cards.length * 100)}% de tus oportunidades` : 'Cada conversación cuenta', color: '#22a47a' }].map(metric => <div key={metric.label} className={styles.metric}><div><span>{metric.label}</span><i style={{ color: metric.color, background: `${metric.color}12` }}><metric.icon size={18} /></i></div><strong>{metric.value.toString().padStart(2, '0')}</strong><small>{metric.foot}</small></div>)}
    </div>

    {error && <div className={styles.error} role="alert">{error}<button aria-label="Cerrar error" onClick={() => setError('')}><X size={16} /></button></div>}
    {notice && <div className={styles.notice} role="status"><Check size={16} />{notice}<button aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}

    <section className={styles.workspace} aria-label="Tablero de oportunidades">
      <div className={styles.toolbar}>
        <div className={styles.boardTitle}><LayoutGrid size={19} /><h3>Tablero comercial</h3><span>{cards.length}</span></div>
        <div className={styles.toolbarRight}><span className={styles.live}><span /> IA + tu equipo</span><select aria-label="Proceso comercial de tu empresa" value={config?.mode || 'services'} disabled={!canOperate || busy || !config} onChange={e => void changeMode(e.target.value as Configuration['mode'])}><option value="services">Servicios · reuniones</option><option value="products">Productos · ventas</option></select></div>
      </div>
      <div className={styles.filters}>
        <div className={styles.tabs}>{[['all', 'Todos'], ['open', 'En curso'], ['manual', 'Gestión manual'], ['perdido', 'No interesados']].map(([id, label]) => <button key={id} className={filter === id ? styles.activeTab : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
        <label className={styles.search}><Search size={16} /><input aria-label="Buscar oportunidad" placeholder="Buscar nombre o WhatsApp…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      </div>
      <div className={styles.board}>
        {!config && <p className={styles.loading} role="status">Cargando tu proceso comercial…</p>}
        {stages.map(stage => {
          const column = filtered.filter(card => card.stage === stage.id);
          return <section key={stage.id} className={`${styles.column} ${over === stage.id ? styles.dropTarget : ''}`} style={{ '--stage-color': colors[stage.id] || '#4594f4' } as React.CSSProperties}
            aria-label={`${stage.label}: ${column.length} oportunidades`}
            onDragOver={e => { if (canOperate && !busy) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(stage.id); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); setDragging(null); setOver(null); if (cards.some(card => card.id === id && card.stage !== stage.id)) void move(id, stage.id); }}>
            <header className={styles.columnHeader}><span className={styles.stageDot} /><h4>{stage.label}</h4><span className={styles.count}>{column.length}</span>{canOperate && <button aria-label={`Agregar oportunidad en ${stage.label}`} disabled={busy} onClick={() => void openCreate(stage.id)}><Plus size={16} /></button>}</header>
            <div className={styles.columnBody}>
              {column.map(card => <article key={card.id} className={`${styles.card} ${dragging === card.id ? styles.dragging : ''}`} draggable={canOperate && !busy}
                onDragStart={e => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; setDragging(card.id); }} onDragEnd={() => { setDragging(null); setOver(null); }}>
                <div className={styles.cardTop}><span className={styles.channel}><MessageCircle size={12} />WhatsApp</span><GripVertical size={15} className={styles.grip} /></div>
                <button className={styles.cardOpen} onClick={() => setSelected(card.id)}><span className={styles.avatar}>{(card.lead_name || card.whatsapp_number || '?').slice(0, 2).toUpperCase()}</span><span><strong>{card.lead_name || 'Contacto de WhatsApp'}</strong><small>{card.whatsapp_number}</small></span><ChevronRight size={15} /></button>
                <p className={styles.interest}>{card.service_interest || (card.stage === 'nuevo' ? 'Una nueva conversación por descubrir' : card.next_action || 'Continuar la conversación')}</p>
                {card.score_signals?.classification_reason && <p className={styles.reason}><Sparkles size={12} />{String(card.score_signals.classification_reason)}</p>}
                <footer><span className={card.score_signals?.manual_stage ? styles.manualBadge : styles.aiBadge}>{card.score_signals?.manual_stage ? <Users size={11} /> : <Bot size={12} />}{card.score_signals?.manual_stage ? 'Manual' : 'Automático'}</span><span title={card.assignee_email || 'Sin responsable'}>{card.assignee_email ? card.assignee_email.split('@')[0] : 'Sin asignar'}</span><time dateTime={card.last_activity_at}>{shortDate(card.last_activity_at)}</time></footer>
              </article>)}
              {!column.length && <div className={styles.emptyColumn}><div><Plus size={18} /></div><p>{search || filter !== 'all' ? 'Sin coincidencias' : 'Todo listo para avanzar'}</p><span>{canOperate ? 'Arrastra una tarjeta hasta aquí' : 'Los contactos aparecerán aquí'}</span></div>}
            </div>
          </section>;
        })}
      </div>
      <footer className={styles.boardFooter}><span><Sparkles size={14} />La IA clasifica cada conversación. Tú puedes ajustar la etapa.</span>{canOperate && <button onClick={() => void importChats()} disabled={busy}>Traer chats anteriores <ArrowDownLeft size={14} /></button>}</footer>
    </section>
    {drafts.length > 0 && <details className={styles.followups}><summary>Seguimientos por revisar <span>{drafts.length}</span></summary><DraftInbox drafts={drafts} canOperate={canOperate} reload={reload} compact /></details>}

    <dialog ref={drawer} className={styles.drawer} onCancel={event => {event.preventDefault();void closeDrawer();}} onClick={e => { if (e.target === e.currentTarget) void closeDrawer(); }}>
      <div className={styles.drawerInner}>
        <header className={styles.drawerHeader}><div><span className={styles.eyebrow}>FICHA DE OPORTUNIDAD</span><h3>{selectedCard?.lead_name || selectedCard?.whatsapp_number || 'Contacto'}</h3></div><button autoFocus aria-label="Cerrar ficha" onClick={() => void closeDrawer()}><X size={21} /></button></header>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {!detail ? <p className={styles.loading}>Cargando la ficha…</p> : <>
          <div className={styles.contactBar}><MessageCircle size={16} />{selectedCard?.whatsapp_number}<span>{detail.score_signals?.manual_stage ? 'Gestión manual' : 'Clasificación automática'}</span></div>
          <div className={styles.detailFields}><label>Etapa actual<select aria-label="Cambiar etapa del contacto" disabled={!canOperate || busy} value={detail.stage} onChange={e => void move(detail.id, e.target.value)}>{stages.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label><label>Responsable<select aria-label="Asignar responsable" value={detail.assignee_id || ''} disabled={!canOperate || busy} onChange={e => void assign(e.target.value)}><option value="">Sin asignar</option>{users.filter(user => user.active !== false && ['owner', 'admin'].includes(user.role)).map(user => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label></div>
          {canOperate && detail.score_signals?.manual_stage && <button className={styles.resume} disabled={busy} onClick={() => void resume()}><Sparkles size={14} />Volver a clasificación automática</button>}
          <div className={styles.nextStep}><span>PRÓXIMO PASO</span><p>{detail.next_action || 'Revisa la conversación y define el siguiente paso.'}</p>{detail.score_signals?.classification_reason && <small>{String(detail.score_signals.classification_reason)}</small>}</div>
          <div className={styles.detailTabs}><button className={tab === 'conversation' ? styles.activeTab : ''} onClick={() => setTab('conversation')}>Conversación <span>{messages.length}</span></button><button className={tab === 'activity' ? styles.activeTab : ''} onClick={() => setTab('activity')}>Actividad y notas</button></div>
          {tab === 'conversation' ? <div className={styles.messages}>{!messages.length && <p className={styles.loading}>Todavía no hay mensajes disponibles en esta ficha.</p>}{messages.map(message => <div key={message.id} className={`${styles.message} ${message.direction === 'outbound' ? styles.outbound : ''}`}><span>{message.direction === 'outbound' ? 'Asistente de ventas' : selectedCard?.lead_name || 'Cliente'}</span><p>{message.text_body || 'Mensaje sin texto'}</p>{message.created_at && <time>{new Date(message.created_at).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>}</div>)}</div> : <div className={styles.activities}>{!detail.activities.length && <p className={styles.loading}>Sin actividad registrada todavía.</p>}{detail.activities.map(activity => <div key={activity.id}><span /><div><p>{activity.content}</p><time>{new Date(activity.created_at).toLocaleString('es-PE')}</time></div></div>)}{detail.proposals.map(proposal => <details key={proposal.id}><summary>{proposal.title}</summary><p className="whitespace-pre-wrap">{proposal.content}</p></details>)}</div>}
          {canOperate && <form className={styles.noteForm} onSubmit={e => void saveNote(e)}><label htmlFor="pipeline-note">Nota interna</label><textarea id="pipeline-note" maxLength={2000} placeholder="Qué falta conversar, qué acordaron, cuándo retomar…" value={note} onChange={e => setNote(e.target.value)} /><Button disabled={busy || !note.trim()} type="submit">Guardar nota <ArrowUpRight size={15} /></Button></form>}
        </>}
      </div>
    </dialog>
    <dialog ref={createDialog} className={styles.createDialog} onCancel={event => {event.preventDefault();void closeCreate();}}>
      <form onSubmit={e => void createCard(e)}><header><h3>Nueva oportunidad</h3><button type="button" aria-label="Cerrar nueva oportunidad" onClick={() => void closeCreate()}><X size={20} /></button></header><p>Agrega un contacto a {labels[newStage || 'nuevo']}.</p>{error && <p role="alert" className={styles.error}>{error}</p>}<label>Contacto<select required value={contactId} onChange={e => setContactId(e.target.value)}><option value="">Selecciona un contacto</option>{contacts.filter(contact => !cards.some(card => card.lead_id === contact.id && !closed(card.stage))).map(contact => <option key={contact.id} value={contact.id}>{contact.name || contact.whatsapp_number}</option>)}</select></label><small>Los nuevos contactos que escriban al agente aparecen automáticamente.</small><Button type="submit" disabled={busy || !contactId}>Agregar al tablero</Button></form>
    </dialog>
  </div>;
}
