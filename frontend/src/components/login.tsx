'use client';

import { useState } from 'react';
import { BookOpenCheck, Building2, Eye, EyeOff, Lock, Mail, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import { login } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui';

export function LoginScreen({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <main className="grid min-h-screen grid-cols-1 bg-[#f4f8f7] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="login-visual relative hidden overflow-hidden lg:block">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            fill="#1087ff"
            d="M0 0H66C66 26 61 36 51 42C44 46 36 45 30 50C22 57 19 64 17 73C14 84 9 94 0 100Z"
          />
          <path
            fill="#071a33"
            d="M0 0H63C63 26 58 35 48 41C41 45.5 34 44 28 49C20 56 17 64 15 73C12 84 7 94 0 100Z"
          />
        </svg>
        <div className="relative z-10 mt-[14vh] flex w-[52%] flex-col items-center text-center text-white">
          <div className="relative mb-5 h-24 w-64 drop-shadow-[0_8px_22px_rgba(16,135,255,0.22)]">
            <Image
              src="/logo.png"
              alt="CRM"
              fill
              sizes="256px"
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-4xl font-black leading-none tracking-[0.08em] xl:text-5xl">SABERO AI</h1>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-blue-100/90">
            Sales Engine
          </p>
        </div>
        <div className="absolute bottom-[14%] left-[26%] z-10 w-[68%] text-sabero-navy">
          <div className="mb-4 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-sabero-navy/75">
            <span className="h-2 w-2 rounded-full bg-sabero-electric shadow-[0_0_12px_rgba(16,135,255,0.55)]" />
            Todo conectado
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[
              { label: 'WhatsApp-first', Icon: MessageCircle },
              { label: 'Conocimiento empresarial', Icon: BookOpenCheck },
              { label: 'Multiempresa', Icon: Building2 },
            ].map(({ label, Icon }) => (
              <div
                key={label}
                className="flex min-h-[6.25rem] flex-col items-center justify-center gap-3 rounded-2xl border border-sabero-electric/40 bg-sabero-mist/90 px-2 py-3 text-center"
              >
                <Icon className="h-6 w-6 text-sabero-electric drop-shadow-[0_0_8px_rgba(16,135,255,0.24)]" />
                <span className="text-[11px] font-semibold leading-4 text-sabero-navy sm:text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md rounded-[28px] border border-white bg-white/95 p-8 shadow-enterprise">
          <div className="flex justify-center">
            <Brand />
          </div>
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
              <input className="w-full bg-transparent outline-none" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </span>
          </label>
          <label className="mt-4 block text-sm font-bold text-slate-600">
            Contrasena segura
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Lock className="h-5 w-5 text-sabero-electric" />
              <input className="w-full bg-transparent outline-none" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-sabero-electric hover:text-sabero-navy">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
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