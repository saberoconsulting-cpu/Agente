'use client';

import { useState } from 'react';
import { apiRequest } from '@/lib/api';
import { useUnsavedChanges } from './action-confirmation';
import { Button, Panel } from './ui';

export function PasswordChange() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  useUnsavedChanges('change-own-password', Boolean(current || password || repeat));
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password !== repeat) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError('');
    try {
      await apiRequest('/auth/password/change', { method: 'POST', body: JSON.stringify({ current_password: current, password }) });
      setCurrent(''); setPassword(''); setRepeat(''); setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'); }
    finally { setBusy(false); }
  }
  return <Panel>
    <p className="text-xs uppercase tracking-widest text-sabero-electric">SEGURIDAD DE TU CUENTA</p>
    <h2 className="mt-2">Cambiar mi contraseña</h2>
    {done ? <div role="status"><p className="mt-4 text-sm text-slate-600">Tu contraseña se actualizó y las sesiones anteriores quedaron cerradas.</p><Button className="mt-5" onClick={() => window.location.assign('/')}>Iniciar sesión de nuevo</Button></div> : <form onSubmit={event => void submit(event)} className="mt-5 grid gap-5">
      <p className="text-sm text-slate-500">Este cambio afecta únicamente a tu cuenta. Al guardar tendrás que iniciar sesión de nuevo.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-semibold text-slate-600">Contraseña actual<input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={event => setCurrent(event.target.value)} className="px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold text-slate-600">Nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} className="px-4 py-3" /></label>
        <label className="grid gap-2 text-sm font-semibold text-slate-600">Repite la nueva contraseña<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={repeat} onChange={event => setRepeat(event.target.value)} className="px-4 py-3" /></label>
      </div>
      <small className="text-slate-500">Entre 12 y 128 caracteres.</small>
      {error && <p role="alert" className="border-l-2 border-red-500 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <Button type="submit" disabled={busy} className="justify-self-start">{busy ? 'Guardando…' : 'Actualizar mi contraseña'}</Button>
    </form>}
  </Panel>;
}
