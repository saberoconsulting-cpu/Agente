/** Public plan catalogue. Prices and image allowances mirror VISION_PLANS in the backend (vision.service.ts). */
export type PublicPlan = {
  id: string;
  name: string;
  price: number;
  tagline: string;
  description: string;
  images: string;
  imagesShort: string;
  support: { title: string; detail: string };
  highlight?: boolean;
};

export const planBenefits = [
  'Agente de ventas en WhatsApp 24/7',
  'Conocimiento de tu empresa desde Drive y documentos',
  'Agenda de reuniones con Google Calendar',
  'Seguimiento de oportunidades y clientes',
];

export const publicPlans: PublicPlan[] = [
  {
    id: 'basic',
    imagesShort: '50 imágenes/mes',
    name: 'Básico',
    price: 7,
    tagline: 'Empieza a vender con IA',
    description: 'Tu primer agente de ventas en WhatsApp, listo en minutos y sin complicaciones técnicas.',
    images: '50 imágenes al mes',
    support: { title: 'Soporte por correo', detail: 'Te ayudamos a configurar y resolver dudas por correo.' },
  },
  {
    id: 'standard',
    imagesShort: '80 imágenes/mes',
    name: 'Estándar',
    price: 12,
    tagline: 'Para negocios con consultas diarias',
    description: 'Más imágenes leídas para atender a clientes que te envían fotos de lo que quieren comprar.',
    images: '80 imágenes al mes',
    support: { title: 'Soporte por correo y ayuda guiada', detail: 'Respuestas del equipo y guías para sacarle más partido al agente.' },
  },
  {
    id: 'pro',
    imagesShort: '120 imágenes/mes',
    name: 'Pro',
    price: 20,
    tagline: 'Crece sin perder ni una venta',
    description: 'Pensado para negocios que venden todas las semanas y necesitan que ninguna foto quede sin respuesta.',
    images: '120 imágenes al mes',
    support: { title: 'Soporte prioritario por WhatsApp', detail: 'Escríbenos directo y pasa al frente de la fila.' },
    highlight: true,
  },
  {
    id: 'business',
    imagesShort: '200 imágenes/mes',
    name: 'Empresarial',
    price: 32,
    tagline: 'Para equipos que venden todos los días',
    description: 'Capacidad para un volumen alto de conversaciones con fotos, con acompañamiento al empezar.',
    images: '200 imágenes al mes',
    support: { title: 'Soporte prioritario y acompañamiento', detail: 'Te acompañamos en la puesta en marcha de tu agente.' },
  },
  {
    id: 'unlimited',
    imagesShort: 'Imágenes ilimitadas*',
    name: 'Ilimitado',
    price: 45,
    tagline: 'Sin contar cada foto',
    description: 'Lee las imágenes de tus clientes sin que tengas que preocuparte por el conteo.',
    images: 'Imágenes sin preocuparte del conteo*',
    support: { title: 'Soporte VIP', detail: 'Atención directa y prioritaria del equipo de SABERO.' },
  },
];

export const planNotes = [
  '*Uso razonable. Si prefieres, conecta tu propia cuenta de OpenAI o Claude para leer imágenes y mantener tu plan más económico.',
  'Precios en dólares estadounidenses (USD), por empresa y por mes.',
];
