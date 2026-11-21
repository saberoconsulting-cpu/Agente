'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ImageIcon, LifeBuoy, Mail } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui';
import { LoginScreen } from '@/components/login';
import { useActionConfirmation } from '@/components/action-confirmation';
import { ClosingBand, FloatingAssistant, HomeView, Reveal } from '@/components/public-home';
import type { PublicGo } from '@/components/public-home';
import { planBenefits, planNotes, publicPlans } from '@/content/plans';
import legal from '@/content/legal.json';
import { pages } from '@/content/seo';

type View = 'inicio' | 'nosotros' | 'planes' | 'acceso';
type Page = Exclude<View, 'acceso'>;
const paths: Record<Page, string> = { inicio: '/', nosotros: '/nosotros', planes: '/planes' };
const titles: Record<Page, string> = { inicio: pages.home.title, nosotros: `${pages.nosotros.title} | SABERO AI`, planes: `${pages.planes.title} | SABERO AI` };
const tabs: { id: Page; label: string }[] = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'planes', label: 'Planes' },
];

function viewFromLocation(): View | null {
  if (typeof window === 'undefined') return null;
  if (window.location.hash === '#acceso') return 'acceso';
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/planes') return 'planes';
  if (path === '/nosotros') return 'nosotros';
  return path === '' ? 'inicio' : null;
}

/** Real link (crawlable, opens in a new tab when asked) that navigates in place on a normal click. */
function NavLink({ target, go, className, current, children }: { target: Page; go: PublicGo; className: string; current?: boolean; children: React.ReactNode }) {
  return (
    <a href={paths[target]} aria-current={current ? 'page' : undefined} className={className}
      onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); void go(target); }}>
      {children}
    </a>
  );
}

export function PublicSite({ onReady, initialView = 'inicio' }: { onReady: () => void; initialView?: Page }) {
  const { confirmDiscard } = useActionConfirmation();
  const [view, setView] = useState<View>(initialView);
  const [accessMode, setAccessMode] = useState<'login' | 'register'>('login');
  const [accessPlan, setAccessPlan] = useState('');

  useEffect(() => {
    const sync = () => {
      const next = viewFromLocation();
      if (!next) return;
      setView(next);
      if (next !== 'acceso') document.title = titles[next];
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);

  const go: PublicGo = async (next, mode = 'login', plan = '') => {
    if (view === 'acceso' && next !== 'acceso' && !(await confirmDiscard())) return;
    setAccessMode(mode);
    setAccessPlan(plan);
    setView(next);
    window.history.pushState(null, '', next === 'acceso' ? `${window.location.pathname}#acceso` : paths[next]);
    if (next !== 'acceso') document.title = titles[next];
    window.scrollTo({ top: 0 });
  };

  if (view === 'acceso') return <LoginScreen key={`${accessMode}-${accessPlan}`} initialMode={accessMode} initialPlan={accessPlan} onBack={() => void go('inicio')} onReady={onReady} />;

  return (
    <div className="public-fine min-h-screen bg-[#f4f8f7] text-sabero-navy">
      <header className="sticky top-0 z-30 border-b border-sabero-line/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <NavLink target="inicio" go={go} className="block" ><Brand size="hero" /></NavLink>
          <nav aria-label="Secciones" className="hidden items-center gap-1 md:flex">
            {tabs.map(tab => (
              <NavLink key={tab.id} target={tab.id} go={go} current={view === tab.id}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition ${view === tab.id ? 'bg-sabero-navy text-white' : 'text-slate-600 hover:bg-sabero-mist hover:text-sabero-electric'}`}>{tab.label}</NavLink>
            ))}
          </nav>
          <Button onClick={() => void go('acceso')}>Iniciar sesión</Button>
        </div>
        <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto px-5 pb-3 md:hidden">
          {tabs.map(tab => (
            <NavLink key={tab.id} target={tab.id} go={go} current={view === tab.id}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${view === tab.id ? 'bg-sabero-navy text-white' : 'text-slate-600'}`}>{tab.label}</NavLink>
          ))}
        </nav>
      </header>

      <main>
        {view === 'inicio' && <HomeView go={go} />}
        {view === 'nosotros' && <About go={go} />}
        {view === 'planes' && <Plans go={go} />}
      </main>

      <SiteFooter go={go} />
      <FloatingAssistant go={go} />
    </div>
  );
}

function SiteFooter({ go }: { go: PublicGo }) {
  const linkClass = 'text-sm text-blue-100/80 transition hover:text-sabero-cyan';
  return (
    <footer className="bg-sabero-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Brand dark />
          <p className="mt-4 max-w-xs text-sm leading-6 text-blue-100/80">El agente de ventas que atiende tu WhatsApp, entiende las fotos de tus clientes y agenda reuniones por ti.</p>
          <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sabero-cyan hover:underline" href={`mailto:${legal.email}`}><Mail className="h-4 w-4" />{legal.email}</a>
        </div>
        <nav aria-label="Producto">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Producto</p>
          <ul className="mt-4 grid gap-2.5">
            <li><NavLink target="inicio" go={go} className={linkClass}>Inicio</NavLink></li>
            <li><NavLink target="nosotros" go={go} className={linkClass}>Nosotros</NavLink></li>
            <li><NavLink target="planes" go={go} className={linkClass}>Planes y precios</NavLink></li>
            <li><button type="button" className={linkClass} onClick={() => void go('acceso')}>Iniciar sesión</button></li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Legal</p>
          <ul className="mt-4 grid gap-2.5">
            <li><Link className={linkClass} href="/terms">Términos y condiciones</Link></li>
            <li><Link className={linkClass} href="/privacy">Política de privacidad</Link></li>
            <li><Link className={linkClass} href="/about">Sobre la aplicación</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Empieza hoy</p>
          <p className="mt-4 text-sm leading-6 text-blue-100/80">Planes mensuales desde US$7. Solicita acceso y nuestro equipo te acompaña.</p>
          <Button className="mt-4" onClick={() => void go('acceso', 'register')}>Solicitar acceso</Button>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-blue-200/80">
          <p>© {new Date().getFullYear()} {legal.operator}. Todos los derechos reservados.</p>
          <p className="max-w-2xl">WhatsApp y Meta son marcas de Meta Platforms, Inc.; Google Calendar y Google Drive, de Google LLC; OpenAI y Claude, de sus respectivos titulares. Se muestran solo para indicar compatibilidad; SABERO AI no está afiliado ni respaldado por ellas.</p>
        </div>
      </div>
    </footer>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">{children}</p>;
}

function About({ go }: { go: PublicGo }) {
  const steps = [
    ['1', 'Conectas tu WhatsApp', 'Vinculas el número de tu negocio de forma oficial, en pocos pasos.'],
    ['2', 'Le enseñas tu negocio', 'Cargas tu catálogo, reglas y documentos. El agente responde con tu información.'],
    ['3', 'Vende y tú supervisas', 'Revisas conversaciones, tomas el control cuando quieras y ves tus oportunidades.'],
  ];
  return (
    <>
      <section className="mx-auto max-w-4xl px-5 py-16 text-center">
        <Reveal>
          <Eyebrow>Nosotros</Eyebrow>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Tecnología que trabaja con tu equipo, no en su lugar</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-600">
            En {legal.operator} creamos SABERO AI Sales Engine para que las empresas atiendan mejor a sus clientes por WhatsApp. La inteligencia artificial responde, da seguimiento y agenda; las personas deciden, cierran y cuidan la relación.
          </p>
        </Reveal>
      </section>
      <section className="mx-auto grid max-w-7xl gap-5 px-5 pb-16 md:grid-cols-3">
        {[
          ['Tu información es tuya', 'Cada empresa tiene su propio espacio, y tú eliges qué documentos usa el agente.'],
          ['Humano cuando importa', 'Tu equipo puede tomar cualquier conversación en el momento que quiera.'],
          ['Claro y sin sorpresas', 'Planes mensuales, simples y en dólares, con soporte incluido.'],
        ].map(([title, text], index) => (
          <Reveal key={title} delay={index * 0.1}>
            <article className="h-full rounded-2xl border border-sabero-line bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-enterprise">
              <h3 className="text-lg font-black">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </article>
          </Reveal>
        ))}
      </section>
      <section className="border-y border-sabero-line bg-white px-5 py-16">
        <div className="mx-auto max-w-7xl">
          <Reveal>
            <Eyebrow>Cómo funciona</Eyebrow>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy">Empieza en tres pasos</h2>
          </Reveal>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map(([number, title, text], index) => (
              <li key={number}>
                <Reveal delay={index * 0.12}>
                  <div className="h-full rounded-2xl border border-sabero-electric/30 bg-sabero-mist/70 p-6 transition hover:border-sabero-electric hover:bg-white hover:shadow-enterprise">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-sabero-electric text-lg font-black">{number}</span>
                    <h3 className="mt-4 text-lg font-black text-sabero-navy">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <div className="pt-16"><ClosingBand go={go} /></div>
    </>
  );
}

function Plans({ go }: { go: PublicGo }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16">
      <Reveal className="mx-auto max-w-3xl text-center">
        <Eyebrow>Planes</Eyebrow>
        <h1 className="mt-2 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Elige el plan que crece contigo</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">Todos incluyen tu agente de ventas en WhatsApp. Cambia de plan cuando tu negocio lo necesite.</p>
      </Reveal>
      <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {publicPlans.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 0.08} className="h-full">
            <article className={`relative flex h-full flex-col rounded-[24px] border bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-enterprise ${plan.highlight ? 'border-sabero-electric shadow-neon' : 'border-sabero-line'}`}>
              {plan.highlight && <span className="absolute -top-3 left-6 rounded-sm bg-sabero-electric px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">Recomendado</span>}
              <h2 className="text-xl font-black">{plan.name}</h2>
              <p className="mt-1 text-sm font-semibold text-sabero-electric">{plan.tagline}</p>
              <p className="mt-5 flex items-end gap-1"><span className="text-4xl font-black tracking-[-0.03em]">US${plan.price}</span><span className="pb-1 text-sm text-slate-500">/ mes</span></p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{plan.description}</p>
              <div className="mt-5 rounded-2xl bg-sabero-mist p-4">
                <p className="flex items-start gap-2 text-sm font-bold"><ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-sabero-electric" />{plan.images}</p>
                <p className="mt-3 flex items-start gap-2 text-sm font-bold"><LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-sabero-crimson" />{plan.support.title}</p>
                <p className="mt-1 pl-6 text-xs leading-5 text-slate-500">{plan.support.detail}</p>
              </div>
              <ul className="mt-5 grid gap-2 text-sm text-slate-600">
                {planBenefits.map(item => <li key={item} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}
              </ul>
              <Button variant={plan.highlight ? 'primary' : 'ghost'} className="mt-6 w-full" onClick={() => void go('acceso', 'register', plan.id)}>Elegir {plan.name}</Button>
            </article>
          </Reveal>
        ))}
      </div>
      <div className="mx-auto mt-8 max-w-3xl text-center text-xs leading-5 text-slate-500">
        {planNotes.map(note => <p key={note}>{note}</p>)}
      </div>
    </section>
  );
}
