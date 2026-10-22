'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpenCheck, Building2, CheckCircle2, Eye, EyeOff, Lock, Mail, MessageCircle, UserRound } from 'lucide-react';
import Image from 'next/image';
import { apiRequest, login } from '@/lib/api';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui';
import { LegalLinks } from '@/components/legal-links';
import {PhoneField} from '@/components/phone-field';
import {internationalPhone} from '@/lib/phone';
import type {CountryCode} from 'libphonenumber-js/max';

export function LoginScreen({ onReady }: { onReady: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry,setPhoneCountry]=useState<CountryCode | ''>('');
  const [website, setWebsite] = useState('');
  const [received, setReceived] = useState(false);
  const [step,setStep] = useState<1|2>(1);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && step === 1) {
      if (!businessName.trim() || !contactName.trim()) {setError('Completa tu empresa y tu nombre.'); return;}
      setStep(2);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Ingresa un correo empresarial valido.');
      return;
    }
    if ((mode === 'login' && password.length < 10) || (mode === 'register' && (password.length < 12 || password.length > 128))) {
      setError(mode === 'register' ? 'Elige una contraseña de entre 12 y 128 caracteres.' : 'La contrasena debe tener al menos 10 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') {
        const normalizedPhone=phoneCountry ? internationalPhone(phone,phoneCountry) : null;
        if(!normalizedPhone){setError('Revisa el número de teléfono y el país elegido.');return;}
        await apiRequest('/platform/access-requests', {method:'POST',body:JSON.stringify({business_name:businessName,contact_name:contactName,email,phone:normalizedPhone,phone_country:phoneCountry,password,website})});
        setReceived(true);
      } else {
        await login(email, password);
        onReady();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'register' ? 'No se pudo enviar la solicitud.' : 'No se pudo iniciar sesión.');
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
          <div className="relative mb-5 ml-auto mr-0 flex h-60 w-60 items-end justify-center sm:h-64 sm:w-64">
            <div className="absolute bottom-2 left-1/2 h-7 w-56 -translate-x-1/2 rounded-[50%] bg-gradient-to-r from-sabero-electric/10 via-sabero-cyan to-sabero-electric/10 blur-[2px] shadow-[0_0_36px_rgba(56,213,255,0.55)] sm:w-60" />
            <div className="absolute bottom-5 left-1/2 h-4 w-44 -translate-x-1/2 rounded-[50%] bg-sabero-navy/20 blur-[6px] sm:w-48" />
            <Image
              src="/bots.png"
              alt="Asistente SABERO"
              width={240}
              height={240}
              sizes="240px"
              className="relative z-10 mb-5 h-52 w-52 rounded-full object-cover sm:h-56 sm:w-56"
            />
          </div>
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

      <section className="flex items-center justify-center px-5 py-8 sm:p-8">
        <form onSubmit={submit} className="w-full max-w-md rounded-[28px] border border-white bg-white p-6 shadow-[0_20px_70px_rgba(10,30,60,0.08)] sm:p-8">
          <div className="flex justify-center">
            <Brand />
          </div>
          <div className="mt-7">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">
              {mode === 'login' ? 'Acceso privado' : received ? 'Gracias por tu interés' : 'Acceso empresarial'}
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy">
              {mode === 'login' ? 'Ingresa a tu centro comercial IA' : received ? 'Solicitud recibida' : 'Solicita acceso para tu empresa'}
            </h2>
          </div>
          {mode === 'register' && !received && <>
            <p className="mt-3 text-sm leading-6 text-slate-500">Cuéntanos de tu negocio. Nuestro equipo revisará tu solicitud.</p>
            <ol aria-label="Pasos de la solicitud" className="my-6 flex list-none items-center gap-4 p-0">
              {[['1', 'Tu empresa'], ['2', 'Contacto']].map(([number, label], index) => <li key={number} aria-current={step === index + 1 ? 'step' : undefined} className="flex flex-1 items-center gap-2.5">
                <span className={`grid h-7 w-5 shrink-0 place-items-center text-sm font-semibold tabular-nums ${step >= index + 1 ? 'text-sabero-electric' : 'text-slate-400'}`}>{number}</span>
                <span className={`text-xs font-semibold ${step >= index + 1 ? 'text-sabero-navy' : 'text-slate-400'}`}>{label}</span>{index === 0 && <span className="ml-auto h-px flex-1 bg-slate-200"/>}
              </li>)}
            </ol>
            {step === 1 && <div className="grid w-full gap-5">
              <label className="block w-full min-w-0 text-sm font-semibold text-slate-600">Empresa<span className="mt-2 flex h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-sabero-electric focus-within:ring-2 focus-within:ring-sabero-electric/10"><Building2 className="h-5 w-5 shrink-0 text-sabero-electric"/><input required maxLength={150} autoComplete="organization" placeholder="Nombre de tu empresa" value={businessName} onChange={event=>setBusinessName(event.target.value)} className="h-full w-0 min-w-0 flex-1 bg-transparent text-base font-normal leading-normal text-sabero-navy caret-sabero-electric outline-none placeholder:text-slate-400"/></span></label>
              <label className="block w-full min-w-0 text-sm font-semibold text-slate-600">Tu nombre<span className="mt-2 flex h-14 w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-sabero-electric focus-within:ring-2 focus-within:ring-sabero-electric/10"><UserRound className="h-5 w-5 shrink-0 text-sabero-electric"/><input required maxLength={120} autoComplete="name" placeholder="¿Cómo te llamas?" value={contactName} onChange={event=>setContactName(event.target.value)} className="h-full w-0 min-w-0 flex-1 bg-transparent text-base font-normal leading-normal text-sabero-navy caret-sabero-electric outline-none placeholder:text-slate-400"/></span></label>
            </div>}
            <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={event=>setWebsite(event.target.value)}/></div>
          </>}
          {!received && (mode === 'login' || step === 2) && <>
          <label className="mt-7 block text-sm font-bold text-slate-600">
            Correo
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Mail className="h-5 w-5 text-sabero-electric" />
              <input required type="email" autoComplete="email" maxLength={254} className="w-full bg-transparent outline-none" placeholder="correo@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </span>
          </label>
          {mode === 'register' && <PhoneField country={phoneCountry} value={phone} onCountryChange={setPhoneCountry} onChange={setPhone}/>}
          </>}
          {(mode === 'login' || (step === 2 && !received)) && <label className="mt-4 block text-sm font-bold text-slate-600">
            Contrasena segura
            <span className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Lock className="h-5 w-5 text-sabero-electric" />
              <input className="w-full bg-transparent outline-none" aria-label="Contraseña" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 10} maxLength={128} required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-sabero-electric hover:text-sabero-navy">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </label>}
          {mode === 'register' && received && <div role="status" className="mt-6"><span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-6 w-6"/></span><p className="text-sm leading-6 text-slate-600">Revisaremos los datos de <strong>{businessName}</strong> y te indicaremos los siguientes pasos. El acceso se habilita tras confirmar el pago.</p><p className="mt-3 text-xs text-slate-400">Todavía no se ha creado una cuenta activa.</p></div>}
          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-sabero-crimson">{error}</p>}
          {!received && <div className="mt-6 flex items-center gap-3">
            {mode === 'register' && step === 2 && <Button type="button" variant="ghost" aria-label="Volver al paso anterior" onClick={()=>{setStep(1);setError('');}} disabled={loading}><ArrowLeft className="h-4 w-4"/></Button>}
            <Button disabled={loading} className="flex-1" variant="primary">{loading ? 'Enviando...' : mode === 'login' ? 'Entrar al dashboard' : step === 1 ? 'Continuar' : 'Enviar solicitud'}{mode === 'register' && !loading && <ArrowRight className="ml-2 h-4 w-4"/>}</Button>
          </div>}
          <button type="button" disabled={loading} onClick={()=>{setMode(mode === 'login' ? 'register' : 'login');setStep(1);setReceived(false);setError('');}} className="mt-5 w-full text-sm font-semibold text-sabero-electric hover:text-blue-700 disabled:opacity-50">{mode === 'login' ? 'Solicitar acceso empresarial' : 'Ya tengo acceso'}</button>
          <div className="mt-6 border-t border-slate-100 pt-5"><LegalLinks /></div>
        </form>
      </section>
    </main>
  );
}
