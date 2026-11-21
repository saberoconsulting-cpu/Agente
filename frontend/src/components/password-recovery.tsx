'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, X } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button } from './ui';
import styles from './password-recovery.module.css';

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

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="password-recovery-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><span>SABERO / ACCESO A TU CUENTA</span><button type="button" aria-label="Cerrar recuperación" disabled={busy} onClick={onClose}><X size={19} /></button></header>
    <div className={styles.body}>
      <h2 id="password-recovery-title">{phase === 'done' ? 'Contraseña actualizada' : 'Recuperar contraseña'}</h2>
      {phase === 'done' ? <div role="status"><CheckCircle2 size={30} className={styles.success} /><p>{message}</p><Button className="mt-5 w-full" onClick={onClose}>Volver al inicio de sesión</Button></div> : <form onSubmit={event => void submit(event)}>
        <p>{phase === 'email' ? 'Escribe el correo con el que accedes a tu empresa. Te enviaremos un código para crear una nueva contraseña.' : message}</p>
        <label>Correo de tu cuenta<input type="email" autoComplete="email" required maxLength={254} readOnly={phase === 'reset'} value={email} onChange={event => setEmail(event.target.value)} /></label>
        {phase === 'reset' && <>
          <label>Código de seis dígitos<input aria-label="Código de recuperación" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
          <label>Repite la nueva contraseña<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={repeat} onChange={event => setRepeat(event.target.value)} /></label>
          <small>Entre 12 y 128 caracteres. El código vence en diez minutos.</small>
        </>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Procesando…' : phase === 'email' ? 'Enviar código por correo' : 'Actualizar contraseña'}</Button>
        {phase === 'reset' && <div className={styles.actions}><button type="button" disabled={busy || cooldown > 0} onClick={() => void requestCode()}>{cooldown ? `Reenviar en ${cooldown} s` : 'Reenviar código'}</button><button type="button" disabled={busy} onClick={() => { setPhase('email'); setCode(''); setPassword(''); setRepeat(''); setError(''); }}><ArrowLeft size={13} />Cambiar correo</button></div>}
      </form>}
    </div>
  </dialog>;
}
