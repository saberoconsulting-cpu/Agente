/** Keep complete sentences; never send a price, condition or instruction cut in half. */
export function whatsappReply(content: string) {
  const text = content.trim();
  const fits = (value: string) => value.length <= 420 && value.split(/\s+/).length <= 55;
  if (text && fits(text)) return text;
  const parts = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  let result = '';
  for (const part of parts) {
    const next = result ? `${result}\n${part}` : part;
    if (!fits(next)) break;
    result = next;
  }
  return result || 'Para orientarte mejor, ¿qué producto o servicio te interesa?';
}
