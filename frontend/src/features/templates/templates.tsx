'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CornerUpLeft, ExternalLink, ImagePlus, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { apiBase, apiRequest, authFetch } from '@/lib/api';
import { Button, Panel } from '@/components/ui';
import { useActionConfirmation, useUnsavedChanges } from '@/components/action-confirmation';

type Component = { type: string; text?: string; format?: string; example?: { body_text?: string[][] }; buttons?: { type: string; text: string; url?: string }[] };
type Template = { id: string; name: string; language: string; category: string; status: string; rejected_reason: string | null; has_image?: boolean; components: Component[] };
type HeaderType = 'NONE' | 'TEXT' | 'IMAGE';
type ButtonDraft = { type: 'QUICK_REPLY' | 'URL'; text: string; url: string };

const statusInfo: Record<string, { label: string; tone: string; help: string }> = {
  APPROVED: { label: 'Aprobada', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200', help: 'Lista para enviar desde Contactos.' },
  PENDING: { label: 'En revisión', tone: 'bg-amber-50 text-amber-700 border-amber-200', help: 'Meta la está revisando. Suele tardar desde minutos hasta 24 horas.' },
  REJECTED: { label: 'Rechazada', tone: 'bg-red-50 text-red-700 border-red-200', help: 'Meta no la aprobó. Crea una nueva con los cambios.' },
  PAUSED: { label: 'Pausada', tone: 'bg-slate-100 text-slate-700 border-slate-200', help: 'Meta la pausó por baja calidad.' },
  DISABLED: { label: 'Desactivada', tone: 'bg-slate-100 text-slate-700 border-slate-200', help: 'Ya no se puede usar.' },
};
const categoryLabel: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidad' };
const field = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-sabero-navy outline-none focus:border-sabero-electric';
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'No se pudo completar la acción.');
const slug = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);

/** WhatsApp text styles: *bold*, _italic_ and ~strike~. */
function whatsappText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*[^*]+\*|_[^_]+_|~[^~]+~)/g;
  let last = 0, key = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0], inner = token.slice(1, -1);
    parts.push(token[0] === '*' ? <strong key={key++}>{inner}</strong> : token[0] === '_' ? <em key={key++}>{inner}</em> : <s key={key++}>{inner}</s>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Preview({ header, image, body, footer, examples, buttons }: { header: string; image: string; body: string; footer: string; examples: string[]; buttons: ButtonDraft[] }) {
  const text = body.replace(/\{\{(\d+)\}\}/g, (_m, n) => examples[Number(n) - 1]?.trim() || `{{${n}}}`);
  const visibleButtons = buttons.filter(b => b.text.trim());
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2.5 bg-[#075E54] px-4 py-2.5 text-white">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 text-xs font-bold">TN</span>
        <div className="leading-tight"><p className="text-sm font-semibold">Tu negocio</p><p className="text-[11px] text-emerald-100">Cuenta de empresa</p></div>
      </div>
      <div className="p-4" style={{ background: '#ECE5DD', backgroundImage: 'radial-gradient(rgba(0,0,0,.04) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
        <p className="mx-auto mb-3 w-fit rounded-md bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm">Hoy</p>
        <div className="relative max-w-[19rem]">
          <span aria-hidden="true" className="absolute left-[-8px] top-0 h-0 w-0 border-l-[8px] border-t-[8px] border-l-transparent border-t-white" />
          <div className="overflow-hidden rounded-lg rounded-tl-none bg-white p-1.5 text-[13.5px] leading-[1.35] shadow-sm">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Imagen del encabezado" className="mb-1.5 max-h-48 w-full rounded-md object-cover" />
            )}
            <div className="px-1.5 pb-0.5 pt-0.5">
              {header && <p className="mb-1 font-bold text-slate-900">{header}</p>}
              <p className={`whitespace-pre-wrap break-words ${text ? 'text-slate-800' : 'text-slate-400'}`}>{text ? whatsappText(text) : 'Aquí verás cómo se verá tu mensaje.'}</p>
              {footer && <p className="mt-1.5 text-xs text-slate-500">{footer}</p>}
              <p className="mt-1 text-right text-[10px] text-slate-400">10:42</p>
            </div>
          </div>
        </div>
        {visibleButtons.map((b, i) => (
          <div key={i} className="mt-1 flex max-w-[19rem] items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-[#027EB5] shadow-sm">
            {b.type === 'URL' ? <ExternalLink className="h-4 w-4" /> : <CornerUpLeft className="h-4 w-4" />}{b.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Templates({ pushLog }: { pushLog: (message: string) => void }) {
  const { confirm } = useActionConfirmation();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState(''), [language, setLanguage] = useState('es'), [category, setCategory] = useState('UTILITY');
  const [headerType, setHeaderType] = useState<HeaderType>('NONE'), [image, setImage] = useState<File | null>(null), [imageUrl, setImageUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [header, setHeader] = useState(''), [body, setBody] = useState(''), [footer, setFooter] = useState('');
  const [examples, setExamples] = useState<string[]>([]), [buttons, setButtons] = useState<ButtonDraft[]>([]);
  const name = slug(title);
  const count = Math.max(0, ...[...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])));
  const dirty = creating && Boolean(title.trim() || header.trim() || image || body.trim() || footer.trim() || buttons.length);
  useUnsavedChanges('whatsapp-template-draft', dirty);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await apiRequest<Template[]>('/whatsapp/templates')); setError(''); }
    catch (reason) { setError(errorText(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function pickImage(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setError('La imagen debe ser JPG o PNG.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('La imagen admite hasta 5 MB.'); return; }
    setError(''); setImage(file);
    setImageUrl(previous => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
  }
  function clearImage() { setImage(null); setImageUrl(previous => { if (previous) URL.revokeObjectURL(previous); return ''; }); if (fileRef.current) fileRef.current.value = ''; }
  function reset() { clearImage(); setEditingId(null); setHeaderType('NONE'); setCreating(false); setTitle(''); setHeader(''); setBody(''); setFooter(''); setExamples([]); setButtons([]); setLanguage('es'); setCategory('UTILITY'); }
  /** Loads an existing template into the form. Meta lets you change header, body, footer and buttons — not name, language or category. */
  function startEdit(template: Template) {
    clearImage(); setError(''); setNotice('');
    const find = (type: string) => template.components.find(item => item.type === type);
    const head = find('HEADER'), bodyComponent = find('BODY'), foot = find('FOOTER'), buttonComponent = find('BUTTONS');
    setTitle(template.name); setLanguage(template.language); setCategory(template.category);
    setHeaderType(head?.format === 'IMAGE' ? 'IMAGE' : head?.format === 'TEXT' ? 'TEXT' : 'NONE');
    setHeader(head?.format === 'TEXT' ? head.text || '' : '');
    const text = bodyComponent?.text || '';
    const variables = Math.max(0, ...[...text.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])));
    const sample = bodyComponent?.example?.body_text?.[0] || [];
    setBody(text); setExamples(Array.from({ length: variables }, (_v, i) => sample[i] || ''));
    setFooter(foot?.text || '');
    setButtons((buttonComponent?.buttons || []).filter(b => b.type === 'QUICK_REPLY' || b.type === 'URL').map(b => ({ type: b.type as ButtonDraft['type'], text: b.text, url: b.url || '' })));
    setEditingId(template.id); setCreating(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function changeBody(value: string) {
    setBody(value);
    const next = Math.max(0, ...[...value.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1])));
    setExamples(current => Array.from({ length: next }, (_v, i) => current[i] || ''));
  }
  function addVariable() { changeBody(`${body}{{${count + 1}}}`); }

  async function submit() {
    setBusy(true); setError(''); setNotice('');
    try {
      const form = new FormData();
      form.append('payload', JSON.stringify({ name, language, category, header_type: headerType, header: headerType === 'TEXT' ? header : '', body, footer, examples, buttons: buttons.map(b => ({ type: b.type, text: b.text, ...(b.type === 'URL' ? { url: b.url } : {}) })) }));
      if (headerType === 'IMAGE' && image) form.append('image', image);
      const response = await authFetch(`${apiBase()}/whatsapp/templates${editingId ? `/${editingId}` : ''}`, { method: editingId ? 'PUT' : 'POST', body: form, signal: AbortSignal.timeout(60000) }, '/whatsapp/templates');
      const result = await response.json().catch(() => null);
      if (!response.ok) { const message = result?.message; throw new Error(Array.isArray(message) ? message.join('. ') : message || 'No se pudo enviar la plantilla.'); }
      pushLog(`Plantilla ${name} ${editingId ? 'actualizada' : 'enviada'} en Meta (${result?.status}).`);
      setNotice(editingId ? 'Cambios enviados a Meta. La plantilla vuelve a revisión; suele aprobarse en minutos.' : 'Plantilla enviada a Meta. Te mostraremos aquí cuando esté aprobada.');
      reset(); await load();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function remove(template: Template) {
    const accepted = await confirm({
      title: `¿Eliminar la plantilla "${template.name}"?`,
      description: 'Se eliminará en todos los idiomas y en Meta. No podrás volver a usar este nombre durante unos días.',
      confirmLabel: 'Sí, eliminar', cancelLabel: 'Conservar', tone: 'danger', icon: 'logout',
    });
    if (!accepted) return;
    setBusy(true); setError('');
    try { await apiRequest(`/whatsapp/templates/${encodeURIComponent(template.name)}`, { method: 'DELETE' }); pushLog(`Plantilla ${template.name} eliminada.`); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  const missingExamples = examples.length !== count || examples.some(item => !item.trim());
  const canSubmit = !busy && (headerType !== 'IMAGE' || Boolean(image)) && (headerType !== 'TEXT' || header.trim().length > 0) && name.length > 0 && body.trim().length > 0 && !missingExamples && buttons.every(b => b.text.trim() && (b.type === 'QUICK_REPLY' || /^https:\/\//.test(b.url)));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">Crea mensajes plantilla para escribirle a un cliente después de 24 horas sin respuesta. Meta los revisa y, al aprobarlos, aparecen al enviar un mensaje desde Contactos.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void load()} disabled={loading} aria-label="Actualizar plantillas"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
          {!creating && <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" />Nueva plantilla</Button>}
        </div>
      </div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</div>}

      {creating && (
        <Panel>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-sabero-navy">{editingId ? `Editar plantilla · ${name}` : 'Nueva plantilla'}</h2><button type="button" aria-label="Cancelar" onClick={reset} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          {editingId && <p className="mb-4 rounded-xl border border-sabero-electric/25 bg-sabero-mist/70 p-3 text-xs leading-5 text-slate-600">Puedes cambiar el encabezado, el mensaje, el pie y los botones. El nombre, el idioma y el tipo no se pueden cambiar. Meta vuelve a revisar la plantilla y permite una edición cada 24 horas por plantilla aprobada.{headerType === 'IMAGE' ? ' Sube la imagen otra vez para guardar los cambios.' : ''}</p>}
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="grid gap-4">
              <label className="text-sm font-semibold text-sabero-navy">Nombre
                <input className={field + (editingId ? ' bg-slate-50 text-slate-500' : '')} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ej. Recordatorio de cita" maxLength={80} disabled={Boolean(editingId)} />
                {name && <span className="mt-1 block text-xs font-normal text-slate-500">Se guardará como: {name}</span>}
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-sabero-navy">Tipo de mensaje
                  <select className={field} value={category} onChange={e => setCategory(e.target.value)} disabled={Boolean(editingId)}><option value="UTILITY">Utilidad (citas, pedidos, avisos)</option><option value="MARKETING">Marketing (ofertas, promociones)</option></select>
                </label>
                <label className="text-sm font-semibold text-sabero-navy">Idioma
                  <select className={field} value={language} onChange={e => setLanguage(e.target.value)} disabled={Boolean(editingId)}><option value="es">Español</option><option value="es_PE">Español (Perú)</option><option value="es_MX">Español (México)</option><option value="en_US">Inglés</option><option value="pt_BR">Portugués</option></select>
                </label>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-sabero-navy">Encabezado <span className="font-normal text-slate-500">(opcional)</span></legend>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de encabezado">
                  {([['NONE', 'Ninguno'], ['TEXT', 'Texto'], ['IMAGE', 'Imagen']] as const).map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={headerType === value} onClick={() => setHeaderType(value)} className={`min-h-10 rounded-xl border px-4 text-sm font-semibold transition ${headerType === value ? 'border-sabero-electric bg-sabero-electric text-white' : 'border-slate-200 bg-white text-sabero-navy hover:border-sabero-electric'}`}>{label}</button>
                  ))}
                </div>
                {headerType === 'TEXT' && <input aria-label="Texto del encabezado" className={field + ' mt-0'} value={header} onChange={e => setHeader(e.target.value)} maxLength={60} placeholder="Ej. Tu cita está confirmada" />}
                {headerType === 'IMAGE' && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="hidden" aria-label="Imagen del encabezado" onChange={e => pickImage(e.target.files?.[0])} />
                    {image ? (
                      <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-slate-700">{image.name} · {(image.size / 1024).toFixed(0)} KB</span><span className="flex gap-2"><Button type="button" variant="ghost" className="min-h-9 text-xs" onClick={() => fileRef.current?.click()}>Cambiar</Button><Button type="button" variant="ghost" className="min-h-9 text-xs" onClick={clearImage}>Quitar</Button></span></div>
                    ) : (
                      <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-1 py-4 text-sm font-semibold text-sabero-electric"><ImagePlus className="h-6 w-6" />Subir imagen<span className="text-xs font-normal text-slate-500">JPG o PNG, hasta 5 MB. Se envía la misma imagen a todos los clientes.</span></button>
                    )}
                  </div>
                )}
              </fieldset>
              <label className="text-sm font-semibold text-sabero-navy">Mensaje
                <textarea className={field} rows={5} value={body} onChange={e => changeBody(e.target.value)} maxLength={1024} placeholder="Hola {{1}}, te recordamos tu cita del {{2}}. Responde a este mensaje si necesitas cambiarla." />
                <span className="mt-1 flex items-center justify-between text-xs font-normal text-slate-500"><span>Usa {'{{1}}'}, {'{{2}}'} para datos que cambian (nombre, fecha). No empieces ni termines con una variable.</span><span>{body.length}/1024</span></span>
              </label>
              <div><Button type="button" variant="ghost" onClick={addVariable} className="min-h-9 text-xs">+ Agregar variable {'{{'}{count + 1}{'}}'}</Button></div>
              {count > 0 && (
                <fieldset className="grid gap-2 rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-sabero-navy">Ejemplo para cada variable</legend>
                  <p className="text-xs text-slate-500">Meta pide un ejemplo real para aprobar la plantilla.</p>
                  {examples.map((value, i) => <input key={i} aria-label={`Ejemplo de {{${i + 1}}}`} className={field} placeholder={`Ejemplo de {{${i + 1}}}`} value={value} maxLength={200} onChange={e => setExamples(current => current.map((item, j) => (j === i ? e.target.value : item)))} />)}
                </fieldset>
              )}
              <label className="text-sm font-semibold text-sabero-navy">Pie del mensaje <span className="font-normal text-slate-500">(opcional)</span>
                <input className={field} value={footer} onChange={e => setFooter(e.target.value)} maxLength={60} />
              </label>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-sabero-navy">Botones <span className="font-normal text-slate-500">(opcional, hasta 3)</span></legend>
                {buttons.map((b, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[9rem_1fr_auto]">
                    <select aria-label="Tipo de botón" className={field + ' mt-0'} value={b.type} onChange={e => setButtons(cur => cur.map((x, j) => (j === i ? { ...x, type: e.target.value as ButtonDraft['type'] } : x)))}><option value="QUICK_REPLY">Respuesta rápida</option><option value="URL">Abrir enlace</option></select>
                    <div className="grid gap-2">
                      <input aria-label="Texto del botón" className={field + ' mt-0'} placeholder="Texto del botón" maxLength={25} value={b.text} onChange={e => setButtons(cur => cur.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                      {b.type === 'URL' && <input aria-label="Enlace del botón" className={field + ' mt-0'} placeholder="https://tuempresa.com" value={b.url} onChange={e => setButtons(cur => cur.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />}
                    </div>
                    <button type="button" aria-label="Quitar botón" onClick={() => setButtons(cur => cur.filter((_x, j) => j !== i))} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {buttons.length < 3 && <div><Button type="button" variant="ghost" className="min-h-9 text-xs" onClick={() => setButtons(cur => [...cur, { type: 'QUICK_REPLY', text: '', url: '' }])}>+ Agregar botón</Button></div>}
              </fieldset>
            </div>
            <div className="grid content-start gap-3">
              <p className="text-sm font-semibold text-sabero-navy">Vista previa</p>
              <Preview header={headerType === 'TEXT' ? header : ''} image={headerType === 'IMAGE' ? imageUrl : ''} body={body} footer={footer} examples={examples} buttons={buttons} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={reset} disabled={busy}>Cancelar</Button>
            <Button onClick={() => void submit()} disabled={!canSubmit}>{busy ? 'Enviando…' : editingId ? 'Enviar cambios a Meta' : 'Enviar a revisión de Meta'}</Button>
          </div>
        </Panel>
      )}

      <Panel>
        <h2 className="mb-4 text-lg font-black text-sabero-navy">Mis plantillas</h2>
        {loading && !items.length ? <p className="text-sm text-slate-500">Cargando plantillas…</p>
          : !items.length ? <p className="text-sm text-slate-500">Aún no tienes plantillas. Crea la primera con el botón “Nueva plantilla”.</p>
          : (
            <ul className="grid gap-3">
              {items.map(item => {
                const info = statusInfo[item.status] || { label: item.status, tone: 'bg-slate-100 text-slate-700 border-slate-200', help: '' };
                const bodyText = item.components.find(c => c.type === 'BODY')?.text || '';
                return (
                  <li key={item.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="break-all font-bold text-sabero-navy">{item.name}</p><p className="text-xs text-slate-500">{categoryLabel[item.category] || item.category} · {item.language}{item.components.some(c => c.type === 'HEADER' && c.format === 'IMAGE') ? ' · Con imagen' : ''}</p></div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${info.tone}`}>{info.label}</span>
                        <button type="button" aria-label={`Editar ${item.name}`} title={['APPROVED', 'REJECTED', 'PAUSED'].includes(item.status) ? 'Editar plantilla' : 'Meta solo permite editar plantillas aprobadas, rechazadas o pausadas'} disabled={busy || !['APPROVED', 'REJECTED', 'PAUSED'].includes(item.status)} onClick={() => startEdit(item)} className="rounded-lg p-2 text-slate-500 hover:bg-sky-50 hover:text-sabero-electric disabled:opacity-40"><Pencil className="h-4 w-4" /></button>
                        <button type="button" aria-label={`Eliminar ${item.name}`} disabled={busy} onClick={() => void remove(item)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{bodyText}</p>
                    <p className="mt-2 text-xs text-slate-500">{item.rejected_reason ? `Motivo: ${item.rejected_reason}. ` : ''}{info.help}</p>
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>
    </div>
  );
}
