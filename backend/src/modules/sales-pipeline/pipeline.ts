export const serviceStages = [
  ['nuevo', 'Nuevos contactos'], ['calificado', 'En conversación'], ['interesado', 'Interesados'], ['seguimiento', 'En seguimiento'],
  ['reunion_propuesta', 'Por agendar'], ['reunion_agendada', 'Esperando reunión'],
  ['propuesta_enviada', 'Propuesta enviada'], ['propuesta', 'En negociación'], ['ganado', 'Clientes ganados'], ['perdido', 'No interesados'],
] as const;
export const productStages = [
  ['nuevo', 'Nuevos contactos'], ['calificado', 'En conversación'], ['interesado', 'Interesados'], ['seguimiento', 'En seguimiento'],
  ['reservado', 'Reservados'], ['pagado', 'Pagados'], ['en_envio', 'En envío'],
  ['ganado', 'Vendidos'], ['perdido', 'No interesados'],
] as const;
export const allStages = [...new Set([...serviceStages, ...productStages].map(([key]) => key))];
export type PipelineMode = 'services' | 'products';
