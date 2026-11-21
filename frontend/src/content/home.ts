/**
 * Sample content for the public home. The brands and comments below are FICTIONAL and exist only to
 * show the design. Replace them with real clients and real, authorised quotes, then set
 * `illustrativeClients` to false so the "casos ilustrativos" notice disappears.
 */
export const illustrativeClients = true;

export type ClientBrand = { name: string; icon: 'coffee' | 'shirt' | 'hammer' | 'smile' | 'home' | 'cpu' | 'flower' | 'plane'; color: string };

export const clientBrands: ClientBrand[] = [
  { name: 'Café Altura', icon: 'coffee', color: '#B45309' },
  { name: 'Moda Nube', icon: 'shirt', color: '#DB2777' },
  { name: 'Ferretería Roble', icon: 'hammer', color: '#15803D' },
  { name: 'Dental Sol', icon: 'smile', color: '#0891B2' },
  { name: 'Casa Brisa', icon: 'home', color: '#1087FF' },
  { name: 'TecnoPunto', icon: 'cpu', color: '#4F46E5' },
  { name: 'Aura Spa', icon: 'flower', color: '#9333EA' },
  { name: 'Ruta Viva Tours', icon: 'plane', color: '#E11D35' },
];

export const testimonials = [
  {
    name: 'Valeria Montes',
    role: 'Dueña',
    brand: 'Moda Nube',
    color: '#DB2777',
    quote: 'Mis clientas mandan fotos de lo que buscan y el agente ya les responde con precio y tallas. Dejé de contestar mensajes de madrugada.',
  },
  {
    name: 'Andrés Quispe',
    role: 'Gerente comercial',
    brand: 'Ferretería Roble',
    color: '#15803D',
    quote: 'Ahora cada consulta queda registrada y con seguimiento. Mi equipo solo entra a cerrar las ventas que ya vienen calientes.',
  },
  {
    name: 'Dra. Lucía Paredes',
    role: 'Directora',
    brand: 'Dental Sol',
    color: '#0891B2',
    quote: 'Las citas se agendan solas en el calendario. Los pacientes escriben por WhatsApp y reciben respuesta en segundos.',
  },
];
