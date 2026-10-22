import { whatsappReply } from './whatsapp-reply';
describe('WhatsApp brevity', () => {
  it('preserves concise product answers', () => expect(whatsappReply('Cuesta S/ 80. ¿Qué talla buscas?')).toBe('Cuesta S/ 80. ¿Qué talla buscas?'));
  it('keeps complete sentences instead of truncating conditions', () => {
    const answer = whatsappReply('Podemos ayudarte a elegir. ' + 'explicacion '.repeat(100));
    expect(answer).toBe('Podemos ayudarte a elegir.');
  });
  it('falls back to a short question if no complete part fits', () => expect(whatsappReply('palabra '.repeat(100)).length).toBeLessThanOrEqual(420));
});
