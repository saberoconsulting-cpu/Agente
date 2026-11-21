import legal from '@/content/legal.json';
import { publicPlans } from '@/content/plans';

export const siteUrl = 'https://agente.saberoconsulting.com';
export const siteName = 'SABERO AI';

export const keywords = [
  'agente de ventas con IA',
  'agentes de ventas en Latinoamérica',
  'agente de ventas con IA en Perú',
  'agente de ventas con IA en México',
  'agente de ventas con IA en Colombia',
  'agente de ventas con IA en Chile',
  'agente de ventas con IA en Argentina',
  'mejor agente de ventas',
  'agentes avanzados de ventas',
  'agentes de automatización',
  'automatizar ventas',
  'automatización de ventas por WhatsApp',
  'agentes para el sector inmobiliario',
  'ventas inmobiliarias con IA',
  'chatbot de ventas para WhatsApp',
  'asistente virtual de ventas',
  'CRM con inteligencia artificial',
  'SABERO AI',
  'SABERO Consulting',
];

export const pages = {
  home: {
    path: '/',
    title: 'Agente de ventas con IA en Latinoamérica | Automatiza tus ventas por WhatsApp',
    description: 'Automatiza tus ventas con el agente de ventas con IA de SABERO: atiende tu WhatsApp 24/7, entiende las fotos de tus clientes, agenda reuniones y da seguimiento. Planes desde US$7.',
  },
  planes: {
    path: '/planes',
    title: 'Planes y precios del agente de ventas con IA',
    description: 'Elige tu plan mensual desde US$7: agente de ventas en WhatsApp con lectura de imágenes, agenda y seguimiento. Compara Básico, Estándar, Pro, Empresarial e Ilimitado.',
  },
  nosotros: {
    path: '/nosotros',
    title: 'Nosotros: automatización de ventas con inteligencia artificial',
    description: 'Conoce a SABERO Consulting y cómo creamos agentes de ventas con IA que atienden WhatsApp, usan el conocimiento de tu empresa y dejan el control en tu equipo.',
  },
} as const;

export const sectors = [
  { name: 'Sector inmobiliario', text: 'Atiende consultas de propiedades, entiende las fotos que envían los interesados, califica prospectos y agenda visitas en tu calendario.' },
  { name: 'Comercio y retail', text: 'Responde por producto y precio, reconoce lo que el cliente muestra en una foto y retoma las conversaciones que se enfrían.' },
  { name: 'Salud y bienestar', text: 'Coordina citas y consultas por WhatsApp, y deja la atención clínica a tu equipo.' },
  { name: 'Turismo y servicios', text: 'Resuelve dudas frecuentes, propone horarios y confirma reservas o reuniones sin que nadie tenga que estar conectado.' },
];

export const faq = [
  {
    q: '¿Qué es un agente de ventas con IA?',
    a: 'Es un asistente que conversa con tus clientes por WhatsApp usando la información de tu negocio: responde consultas, califica prospectos, agenda reuniones y da seguimiento. Tu equipo puede tomar cualquier conversación cuando quiera.',
  },
  {
    q: '¿Cómo puedo automatizar mis ventas por WhatsApp?',
    a: 'Conectas el número de tu negocio, cargas tu catálogo y tus documentos, y el agente atiende a tus clientes a cualquier hora. Tú supervisas las conversaciones y las oportunidades desde un panel.',
  },
  {
    q: '¿Sirve para el sector inmobiliario y las ventas inmobiliarias?',
    a: 'Sí. Puede atender consultas de propiedades, entender las fotos que te envían los interesados, calificar prospectos y agendar visitas con Google Calendar, mientras tus asesores se enfocan en cerrar.',
  },
  {
    q: '¿Cuál es el mejor agente de ventas con IA para mi empresa?',
    a: 'Depende de lo que necesites. Conviene comparar si usa WhatsApp de forma oficial, si responde con el conocimiento de tu negocio, si permite que tu equipo tome el control, si da seguimiento a las oportunidades y cuánto cuesta. SABERO AI cubre esos puntos, y puedes solicitar acceso para probarlo con tu negocio.',
  },
  {
    q: '¿El agente entiende las fotos que envían mis clientes?',
    a: 'Sí. Cuando un cliente envía una imagen, el agente la interpreta y responde sobre lo que ve. Cada plan incluye una cantidad mensual de imágenes, y puedes conectar tu propia cuenta de OpenAI o Claude si prefieres.',
  },
  {
    q: '¿Cuánto cuesta el agente de ventas?',
    a: 'Los planes son mensuales y van desde US$7 hasta US$45, según la cantidad de imágenes que lee el agente y el nivel de soporte. Todos incluyen el agente de ventas en WhatsApp.',
  },
];

const organization = {
  '@type': 'Organization',
  '@id': `${siteUrl}/#organization`,
  name: legal.operator,
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  email: legal.email,
};

/** JSON-LD graphs. Only facts that appear on the page; no ratings or reviews. */
export function siteGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      { '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: siteUrl, name: 'SABERO AI Sales Engine', inLanguage: 'es-419', publisher: { '@id': `${siteUrl}/#organization` } },
    ],
  };
}

export function softwareGraph() {
  const prices = publicPlans.map(plan => plan.price);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SABERO AI Sales Engine',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: pages.home.description,
    url: siteUrl,
    inLanguage: 'es-419',
    areaServed: 'Latinoamérica',
    publisher: { '@id': `${siteUrl}/#organization` },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: publicPlans.length,
      offers: publicPlans.map(plan => ({ '@type': 'Offer', name: `Plan ${plan.name}`, price: plan.price, priceCurrency: 'USD', url: `${siteUrl}/planes` })),
    },
  };
}

export function faqGraph() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
  };
}

/** Serialises JSON-LD safely for inline <script> tags. */
export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
