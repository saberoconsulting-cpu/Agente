'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, BellRing, BookOpenCheck, Building2, CalendarClock, CheckCheck, Coffee, Cpu, Flower2, Hammer, Home as HomeIcon, ImageIcon, MessageCircle, Plane, Quote, Shirt, ShieldCheck, Smile, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { BrandIcon } from '@/components/brand-icons';
import type { BrandId } from '@/components/brand-icons';
import { clientBrands, illustrativeClients, testimonials } from '@/content/home';
import { faq, faqGraph, jsonLd, sectors, softwareGraph } from '@/content/seo';
import '@/content/home.css';

export type PublicGo = (view: 'inicio' | 'nosotros' | 'planes' | 'acceso', mode?: 'login' | 'register', plan?: string) => Promise<void>;

const brandIcons = { coffee: Coffee, shirt: Shirt, hammer: Hammer, smile: Smile, home: HomeIcon, cpu: Cpu, flower: Flower2, plane: Plane };

/** Fades and lifts its children into view the first time they are scrolled to. */
export function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={{ '--d': `${delay}s` } as React.CSSProperties} className={`reveal ${visible ? 'is-visible' : ''} ${className}`}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-black uppercase tracking-[0.22em] text-sabero-crimson">{children}</p>;
}

/** Official WhatsApp glyph (white) on the brand green. */
export function WhatsAppMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-lg bg-[#25D366] shadow-[0_8px_22px_rgba(37,211,102,0.35)] ${className}`}>
      <BrandIcon id="whatsapp" color="#fff" className="h-3/5 w-3/5" />
    </span>
  );
}

function ChatDemo() {
  return (
    <div className="float-slow relative mx-auto w-full max-w-[22rem]">
      <div className="overflow-hidden rounded-[32px] border border-white bg-white shadow-[0_30px_80px_rgba(10,30,60,0.18)]">
        <div className="flex items-center gap-3 bg-[#075E54] px-5 py-4 text-white">
          <WhatsAppMark className="h-9 w-9" />
          <div>
            <p className="text-sm font-black leading-4">Tienda de ejemplo</p>
            <p className="flex items-center gap-1.5 text-[11px] text-emerald-100"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Agente SABERO en línea</p>
          </div>
        </div>
        <div className="grid gap-3 bg-[#ECE5DD] px-4 py-5 text-sm">
          <div className="msg-in ml-auto w-44 rounded-2xl rounded-tr-sm bg-[#DCF8C6] p-2 shadow-sm" style={{ '--d': '0.6s' } as React.CSSProperties}>
            <div className="grid h-24 place-items-center rounded-xl bg-gradient-to-br from-sabero-electric/25 to-sabero-cyan/40 text-sabero-electric"><ImageIcon className="h-8 w-8" /></div>
            <p className="mt-1.5 px-1 text-[13px] text-slate-800">¿Tienen este modelo?</p>
            <p className="flex items-center justify-end gap-1 text-[10px] text-slate-500">10:42 <CheckCheck className="h-3 w-3 text-sky-500" /></p>
          </div>
          <div className="msg-in max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm" style={{ '--d': '1.8s' } as React.CSSProperties}>
            <p className="text-[13px] leading-5 text-slate-800">¡Hola! Veo un bolso de cuero marrón. Tenemos uno muy parecido en stock 😊</p>
          </div>
          <div className="msg-in max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 shadow-sm" style={{ '--d': '3.1s' } as React.CSSProperties}>
            <p className="text-[13px] leading-5 text-slate-800">¿Te lo reservo y coordinamos la entrega mañana?</p>
          </div>
          <div className="msg-in w-16 rounded-2xl rounded-tl-sm bg-white px-3 py-3 shadow-sm" style={{ '--d': '4.2s' } as React.CSSProperties}>
            <span className="typing flex gap-1"><span /><span /><span /></span>
          </div>
        </div>
      </div>
      <div className="float-fast absolute -left-4 top-24 hidden items-center gap-2 rounded-2xl border border-sabero-line bg-white px-3 py-2 text-xs font-bold text-sabero-navy shadow-enterprise sm:flex">
        <ImageIcon className="h-4 w-4 text-sabero-electric" />Entiende fotos
      </div>
      <div className="float-slow absolute -right-3 bottom-16 hidden items-center gap-2 rounded-2xl border border-sabero-line bg-white px-3 py-2 text-xs font-bold text-sabero-navy shadow-enterprise sm:flex">
        <CalendarClock className="h-4 w-4 text-sabero-crimson" />Agenda citas
      </div>
      <p className="mt-4 text-center text-[11px] font-semibold text-slate-400">Ejemplo ilustrativo de conversación</p>
    </div>
  );
}

function Hero({ go }: { go: PublicGo }) {
  return (
    <section className="grid min-h-[calc(100vh-4.5rem)] grid-cols-1 bg-[#f4f8f7] lg:grid-cols-[1.05fr_0.95fr]">
      <div className="login-visual relative overflow-hidden bg-sabero-navy lg:bg-transparent">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path fill="#1087ff" d="M0 0H72C72 56 70 68 62 76C52 87 28 92 0 100Z" />
          <path fill="#071a33" d="M0 0H69C69 56 67 67 59 75C49 86 26 91 0 100Z" />
        </svg>
        <div aria-hidden="true" className="glow-pulse pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-sabero-electric/30 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-start px-6 py-14 text-white sm:px-10 lg:w-[62%] lg:pl-12 lg:pr-0 lg:pt-8 xl:pl-16">

          <Reveal delay={0.1}>
            <h1 className="text-4xl font-black leading-[1.05] tracking-[-0.03em] sm:text-5xl">
              Tu equipo de ventas con IA que <span className="text-sabero-cyan">cierra por WhatsApp</span>
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mt-6 max-w-md text-base leading-7 text-blue-100">Atiende mensajes, entiende fotos, agenda reuniones y da seguimiento. Tú supervisas, la IA vende.</p>
          </Reveal>
          <Reveal delay={0.3}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => void go('acceso', 'register')} className="px-6">Empezar ahora<ArrowRight className="ml-2 h-4 w-4" /></Button>
              <Button variant="ghost" onClick={() => void go('planes')} className="!border-white/30 !bg-transparent px-6 !text-white hover:!border-sabero-cyan hover:!text-sabero-cyan">Ver cómo funciona</Button>
            </div>
          </Reveal>
          <Reveal delay={0.4}>
            <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-4">
              <div className="flex -space-x-2">
                {['#6366f1', '#ec4899', '#f59e0b', '#10b981'].map((color, i) => (
                  <span key={i} className="grid h-7 w-7 place-items-center rounded-full border-2 border-sabero-navy text-[9px] font-black text-white" style={{ background: color }}>{['MA', 'LC', 'DR', 'JP'][i]}</span>
                ))}
              </div>
              <div>
                <p className="text-[11px] font-black text-white">+120 empresas en Latam</p>
                <p className="text-[10px] text-blue-200/70">ya venden con SABERO</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
      <div className="relative flex items-center justify-center overflow-hidden px-5 py-14 sm:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-sabero-cyan/20 blur-3xl" />
        <Image src="/bots.png" alt="" aria-hidden="true" width={140} height={140} className="float-fast absolute right-6 top-6 hidden h-24 w-24 rounded-full object-cover opacity-90 xl:block" />
        <div className="w-full lg:-translate-x-12 xl:-translate-x-20"><ChatDemo /></div>
      </div>
    </section>
  );
}

function ClientsSection() {
  const loop = [...clientBrands, ...clientBrands];
  return (
    <section className="bg-white py-16">
      <Reveal className="mx-auto max-w-3xl px-5 text-center">
        <Eyebrow>Nuestros clientes</Eyebrow>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy sm:text-4xl">Negocios que ya venden conversando</h2>
        {illustrativeClients && <p className="mt-2 text-xs font-semibold text-slate-400">Casos ilustrativos con marcas ficticias</p>}
      </Reveal>
      <div className="marquee mt-10 overflow-hidden" aria-label="Marcas de ejemplo">
        <div className="marquee-track gap-5 py-2">
          {loop.map((brand, index) => {
            const Icon = brandIcons[brand.icon];
            return (
              <div key={`${brand.name}-${index}`} aria-hidden={index >= clientBrands.length} className="flex shrink-0 items-center gap-3 rounded-2xl border border-sabero-line bg-sabero-mist px-5 py-3.5 mx-2.5">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: brand.color }}><Icon className="h-5 w-5" /></span>
                <span className="whitespace-nowrap text-base font-black tracking-[-0.01em] text-sabero-navy">{brand.name}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mx-auto mt-14 grid max-w-7xl gap-5 px-5 md:grid-cols-3">
        {testimonials.map((item, index) => (
          <Reveal key={item.name} delay={index * 0.12}>
            <article className="relative h-full rounded-[24px] border border-sabero-line bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-enterprise">
              <Quote className="h-8 w-8 text-sabero-electric/25" />
              <p className="mt-3 text-sm leading-6 text-slate-700">“{item.quote}”</p>
              <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4">
                <span className="grid h-11 w-11 place-items-center rounded-full text-sm font-black text-white" style={{ background: item.color }}>{item.name.replace('Dra. ', '').split(' ').map(part => part[0]).join('').slice(0, 2)}</span>
                <div>
                  <p className="text-sm font-black text-sabero-navy">{item.name}</p>
                  <p className="text-xs text-slate-500">{item.role} · {item.brand}</p>
                </div>
                <span className="ml-auto"><WhatsAppMark className="h-7 w-7" /></span>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}


const integrations: { id: BrandId; label: string; text: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', text: 'Atiende a tus clientes en el canal donde ya conversan.' },
  { id: 'googlecalendar', label: 'Google Calendar', text: 'Agenda y confirma reuniones en tu calendario.' },
  { id: 'googledrive', label: 'Google Drive', text: 'Usa los documentos que tú elijas como conocimiento.' },
  { id: 'meta', label: 'Meta', text: 'Conexión oficial con la API de WhatsApp Business.' },
  { id: 'openai', label: 'OpenAI', text: 'Lectura de imágenes con tu propia cuenta, si lo prefieres.' },
  { id: 'anthropic', label: 'Claude', text: 'Alternativa de Anthropic para entender las fotos.' },
];

function Integrations() {
  return (
    <section className="border-y border-sabero-line bg-white py-16">
      <div className="mx-auto max-w-7xl px-5">
        <Reveal className="max-w-2xl">
          <Eyebrow>Integraciones</Eyebrow>
          <h2 className="mt-2 text-3xl text-sabero-navy sm:text-4xl">Se conecta con las herramientas que ya usas</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map(({ id, label, text }, index) => (
            <Reveal key={id} delay={(index % 3) * 0.1}>
              <div className="flex h-full items-start gap-4 rounded-xl border border-sabero-electric/30 bg-sabero-mist/70 p-5 transition hover:border-sabero-electric hover:bg-white hover:shadow-enterprise">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-sabero-line bg-white"><BrandIcon id={id} className="h-6 w-6" /></span>
                <div><h3 className="text-base font-bold text-sabero-navy">{label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { Icon: MessageCircle, title: 'WhatsApp primero', text: 'Atiende consultas al instante, a cualquier hora, con el tono de tu empresa.' },
    { Icon: BookOpenCheck, title: 'Conoce tu negocio', text: 'Responde con tu catálogo, precios y los documentos que tú eliges, incluso desde Google Drive.' },
    { Icon: ImageIcon, title: 'Entiende las fotos', text: 'Tus clientes envían una imagen de lo que quieren y el agente responde sobre lo que ve.' },
    { Icon: CalendarClock, title: 'Agenda reuniones', text: 'Propone horarios y confirma citas directamente en tu Google Calendar.' },
    { Icon: BellRing, title: 'Da seguimiento', text: 'Detecta oportunidades y retoma conversaciones para que ninguna venta se enfríe.' },
    { Icon: ShieldCheck, title: 'Tú tienes el control', text: 'Tu equipo puede tomar la conversación cuando quiera. Cada empresa tiene su propio espacio.' },
  ];
  return (
    <section className="mx-auto max-w-7xl px-5 py-16">
      <Reveal className="max-w-2xl">
        <Eyebrow>Todo conectado</Eyebrow>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.03em] text-sabero-navy sm:text-4xl">Un agente que vende, no solo contesta</h2>
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ Icon, title, text }, index) => (
          <Reveal key={title} delay={(index % 3) * 0.1}>
            <article className="h-full rounded-2xl border border-sabero-line bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-enterprise">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sabero-mist text-sabero-electric"><Icon className="h-6 w-6" /></span>
              <h3 className="mt-5 text-lg font-black text-sabero-navy">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function ClosingBand({ go }: { go: PublicGo }) {
  return (
    <section className="px-5 pb-20">
      <Reveal>
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[28px] bg-sabero-navy px-8 py-12 text-white shadow-enterprise">
          <div aria-hidden="true" className="glow-pulse pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sabero-electric/40 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-black tracking-[-0.02em] sm:text-3xl">¿Listo para que tu WhatsApp venda por ti?</h2>
            <p className="mt-2 text-sm text-blue-100/90">Elige un plan desde US$7 al mes y empieza hoy.</p>
          </div>
          <Button onClick={() => void go('planes')} className="relative px-6">Ver planes<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </div>
      </Reveal>
    </section>
  );
}

/** Floating assistant: appears after a moment at the bottom-right and grows into a small panel with quick actions. */
export function FloatingAssistant({ go }: { go: PublicGo }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!shown) return null;
  const actions: [string, () => Promise<void>][] = [
    ['Ver los planes', () => go('planes')],
    ['Solicitar acceso', () => go('acceso', 'register')],
    ['Conocer a SABERO', () => go('nosotros')],
  ];
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <div data-open={open} role="dialog" aria-label="Asistente SABERO" className="widget-panel w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-3xl border border-sabero-line bg-white shadow-[0_24px_70px_rgba(10,30,60,0.22)]">
        <div className="flex items-center gap-3 bg-sabero-navy px-5 py-4 text-white">
          <WhatsAppMark className="h-9 w-9" />
          <div className="flex-1"><p className="text-sm font-black leading-4">Asistente SABERO</p><p className="text-[11px] text-blue-200">En línea</p></div>
          <button type="button" aria-label="Cerrar asistente" onClick={() => setOpen(false)} className="rounded-lg p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 bg-[#ECE5DD] p-4">
          <p className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-5 text-slate-800 shadow-sm">¡Hola! 👋 Soy el asistente de SABERO. ¿Qué te gustaría hacer?</p>
          {actions.map(([label, run]) => (
            <button key={label} type="button" onClick={() => { setOpen(false); void run(); }} className="rounded-xl border border-sabero-electric/40 bg-white px-4 py-2.5 text-left text-sm font-bold text-sabero-electric transition hover:bg-sabero-electric hover:text-white">{label}</button>
          ))}
        </div>
      </div>
      <button type="button" aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'} aria-expanded={open} onClick={() => setOpen(value => !value)} className="widget-pop pulse-ring rounded-lg">
        <WhatsAppMark className="h-14 w-14" />
      </button>
    </div>
  );
}

function SeoIntro() {
  return (
    <section className="bg-white py-16">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <Eyebrow>Agentes de automatización de ventas</Eyebrow>
          <h2 className="mt-2 text-3xl text-sabero-navy sm:text-4xl">Agentes de ventas con IA para empresas en Latinoamérica</h2>
          <p className="mt-5 text-base leading-7 text-slate-600">
            Si buscas el mejor agente de ventas para tu negocio, conviene mirar qué hace de verdad: atender a tus clientes por WhatsApp a cualquier hora, responder con la información de tu empresa, calificar prospectos y dar seguimiento hasta cerrar. SABERO AI reúne todo eso en un solo agente avanzado de ventas, para empresas de Perú, México, Colombia, Chile, Argentina y el resto de Latinoamérica.
          </p>
          <p className="mt-4 text-base leading-7 text-slate-600">
            Automatiza tus ventas sin perder el trato humano: tu equipo ve cada conversación y puede tomarla cuando quiera. Sin instalar nada y con planes mensuales desde US$7.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {sectors.map((sector, index) => (
            <Reveal key={sector.name} delay={index * 0.08}>
              <article className="h-full rounded-xl border border-sabero-electric/30 bg-sabero-mist/70 p-5 transition hover:border-sabero-electric hover:bg-white hover:shadow-enterprise">
                <h3 className="text-base font-bold text-sabero-navy">{sector.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{sector.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-16">
      <Reveal className="text-center">
        <Eyebrow>Preguntas frecuentes</Eyebrow>
        <h2 className="mt-2 text-3xl text-sabero-navy sm:text-4xl">Todo sobre el agente de ventas con IA</h2>
      </Reveal>
      <div className="mt-10 grid gap-3">
        {faq.map(item => (
          <Reveal key={item.q}>
            <details className="group rounded-xl border border-sabero-line bg-white px-5 py-4 open:border-sabero-electric/50 open:shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-sabero-navy [&::-webkit-details-marker]:hidden">
                <h3 className="text-base font-bold">{item.q}</h3>
                <span aria-hidden="true" className="text-xl font-normal text-sabero-electric transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function HomeView({ go }: { go: PublicGo }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareGraph()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqGraph()) }} />
      <Hero go={go} />
      <ClientsSection />
      <Integrations />
      <Features />
      <SeoIntro />
      <Faq />
      <ClosingBand go={go} />
    </>
  );
}
