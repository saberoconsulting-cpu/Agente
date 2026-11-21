'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button } from './ui';

export function PasswordRecovery({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);

  async function requestCode() {
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ message: string }>('/auth/password/request', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(result.message); setPhase('reset'); setCooldown(60);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo solicitar el código.'); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (phase === 'email') { await requestCode(); return; }
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    try {
      const result = await apiRequest<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ email, code, password }) });
      setPassword(''); setRepeat(''); setCode(''); setMessage(result.message); setPhase('done');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.'); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="password-recovery-dialog w-[min(440px,calc(100%-32px))] max-h-[92dvh] my-auto mx-auto p-0 overflow-y-auto rounded-[28px] border border-white bg-white shadow-[0_30px_80px_rgba(10,30,60,0.22)] text-sabero-navy" aria-labelledby="password-recovery-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
      <span className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-400">SABERO / ACCESO A TU CUENTA</span>
      <button type="button" aria-label="Cerrar recuperación" disabled={busy} onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-sabero-navy"><X size={19} /></button>
    </header>
    <div className="p-7">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">{phase === 'done' ? 'Contraseña actualizada' : 'Recuperar contraseña'}</p>
      <h2 id="password-recovery-title" className="mt-2 text-2xl font-black tracking-[-0.03em] text-sabero-navy">
        {phase === 'done' ? 'Listo para entrar' : 'Escribe tu nueva contraseña'}
      </h2>
      {phase === 'done' ? <div role="status" className="mt-5"><span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6"/></span><p className="text-sm leading-6 text-slate-600">{message}</p><Button className="mt-5 w-full" onClick={onClose}>Volver al inicio de sesión</Button></div> : <form onSubmit={event => void submit(event)} className="grid gap-5">
        <p className="text-sm leading-6 text-slate-500">{phase === 'email' ? 'Escribe el correo con el que accedes a tu empresa. Te enviaremos un código para crear una nueva contraseña.' : message}</p>
        <label className="block text-sm font-bold text-slate-600">Correo de tu cuenta
          <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <input type="email" autoComplete="email" required maxLength={254} readOnly={phase === 'reset'} value={email} onChange={event => setEmail(event.target.value)} className="w-full bg-transparent outline-none placeholder:text-slate-400" />
          </span>
        </label>
        {phase === 'reset' && <>
          <label className="block text-sm font-bold text-slate-600">Código de seis dígitos
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input aria-label="Código de recuperación" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full bg-transparent outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-600">Nueva contraseña
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} className="w-full bg-transparent outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <label className="block text-sm font-bold text-slate-600">Repite la nueva contraseña
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} className="w-full bg-transparent outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <small className="text-xs text-slate-400">Entre 12 y 128 caracteres. El código vence en diez minutos.</small>
        </>}
        {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-sabero-crimson" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Procesando…' : phase === 'email' ? 'Enviar código por correo' : 'Actualizar contraseña'}</Button>
        {phase === 'reset' && <div className="flex flex-wrap items-center justify-between gap-4">
          <button type="button" disabled={busy || cooldown > 0} onClick={() => void requestCode()} className="text-sm font-semibold text-sabero-electric hover:text-blue-700 disabled:opacity-50">{cooldown ? `Reenviar en ${cooldown} s` : 'Reenviar código'}</button>
          <button type="button" disabled={busy} onClick={() => { setPhase('email'); setCode(''); setPassword(''); setRepeat(''); setError(''); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-sabero-electric"><ArrowLeft size={13} />Cambiar correo</button>
        </div>}
      </form>}
    </div>
  </dialog>;
}
