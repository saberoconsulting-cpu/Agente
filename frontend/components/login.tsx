'use client';

import { useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { login } from '../lib/api';
import { Brand } from './brand';
import { Button } from './ui';

export function LoginScreen({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un correo empresarial valido.');
      return;
    }
    if (password.length < 10) {
      setError('La contrasena debe tener al menos 10 caracteres.');
      return;
    }
    if (mode === 'register') {
      setError('El alta de empresas se habilita desde el panel administrador.');
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="saber-grid grid min-h-screen grid-cols-1 bg-sabero-mist lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sabero-navy p-12 text-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_16%,rgba(16,135,255,0.38),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(225,29,53,0.22),transparent_26%)]" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <Brand dark />
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-black uppercase tracking-[0.28em] text-sabero-cyan">
              Conversational revenue platform
            </p>
            <h1 className="text-6xl font-black leading-[0.94] tracking-[-0.04em]">
              Tu vendedor IA, entrenado con el ADN comercial de tu empresa.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-blue-100">
              Fase beta configurada para SABERO Consulting: software a medida, arquitectura cloud,
              automatizaciones con IA y cierre de reuniones calificadas.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm text-blue-100">
            {['WhatsApp-first', 'RAG empresarial', 'Multiempresa'].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                <ShieldCheck className="mb-3 h-5 w-5 text-sabero-cyan" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-[28px] border border-white bg-white/95 p-8 shadow-enterprise">
          <Brand />
          <div className="mt-8">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">
              {mode === 'login' ? 'Acceso privado' : 'Solicitud de cuenta'}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy">
              {mode === 'login' ? 'Ingresa a tu centro comercial IA' : 'Crea acceso empresarial'}
            </h2>
          </div>
          <label className="mt-7 block text-sm font-bold text-slate-600">
            Correo
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Mail className="h-5 w-5 text-sabero-electric" />
              <input className="w-full bg-transparent outline-none" value={email} onChange={(e) => setEmail(e.target.value)} />
            </span>
          </label>
          <label className="mt-4 block text-sm font-bold text-slate-600">
            Contrasena segura
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Lock className="h-5 w-5 text-sabero-electric" />
              <input className="w-full bg-transparent outline-none" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </span>
          </label>
          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-sabero-crimson">{error}</p>}
          <Button disabled={loading} className="mt-6 w-full" variant={mode === 'login' ? 'primary' : 'danger'}>
            {loading ? 'Validando...' : mode === 'login' ? 'Entrar al dashboard' : 'Solicitar acceso'}
          </Button>
          <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="mt-4 w-full text-sm font-black text-sabero-electric">
            {mode === 'login' ? 'Crear acceso para una empresa' : 'Ya tengo acceso'}
          </button>
        </form>
      </section>
    </main>
  );
}
