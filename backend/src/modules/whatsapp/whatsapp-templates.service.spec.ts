/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WhatsappTemplatesService', () => {
  const audit = { record: jest.fn() };
  const connections = {
    findActiveForCompany: jest.fn().mockResolvedValue({ waba_id: 'waba-1', meta_app_id: 'app-1' }),
    decryptAccessToken: jest.fn().mockReturnValue('token'),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const platform = { assertCompany: jest.fn() };
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  const service = new WhatsappTemplatesService(config as any, db as any, connections as any, platform as any, audit as any);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  const valid = { name: 'promo_noviembre', language: 'es', category: 'MARKETING', body: 'Hola {{1}}, tu cita es el {{2}}. Te esperamos.', examples: ['Ana', 'lunes'] };

  beforeEach(() => jest.clearAllMocks());

  it('lista las plantillas de Meta aunque falle la tabla local de imágenes (no lo presenta como falla de Meta)', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { data: [{ id: '1', name: 'promo', language: 'es', category: 'MARKETING', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hola' }] }] } });
    db.query.mockRejectedValue(new Error('relation "whatsapp_template_media" does not exist'));
    const result = await service.list('acme');
    db.query.mockResolvedValue({ rows: [] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'promo', status: 'APPROVED', has_image: false });
  });

  it('solo dice que Meta no respondió cuando de verdad no hubo respuesta de red', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }));
    await expect(service.list('acme')).rejects.toThrow('Meta no respondió a tiempo');
    mockedAxios.get.mockRejectedValueOnce({ response: { status: 401, data: { error: { code: 190, message: 'expired' } } } });
    await expect(service.list('acme')).rejects.toThrow('Reconecta WhatsApp');
  });

  it('edita una plantilla existente en Meta enviando solo los componentes', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true } });
    const result = await service.update('acme', 'user-1', '123456789012345', valid);
    expect(result).toMatchObject({ id: '123456789012345', name: 'promo_noviembre', status: 'PENDING' });
    const [url, body] = mockedAxios.post.mock.calls[0] as any[];
    expect(url).toMatch(/\/123456789012345$/);
    expect(Object.keys(body)).toEqual(['components']);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'whatsapp.template_updated' }));
    await expect(service.update('acme', 'user-1', '../etc', valid)).rejects.toThrow(BadRequestException);
  });

  it('arma el payload de Meta con ejemplos, pie y botones', () => {
    const payload = service.buildPayload({ ...valid, header: 'Aviso', footer: 'Gracias', buttons: [{ type: 'QUICK_REPLY', text: 'Confirmo' }, { type: 'URL', text: 'Ver', url: 'https://sabero.pe/x' }] });
    expect(payload.components.map((item: any) => item.type)).toEqual(['HEADER', 'BODY', 'FOOTER', 'BUTTONS']);
    expect((payload.components[1] as any).example).toEqual({ body_text: [['Ana', 'lunes']] });
  });

  it.each([
    ['nombre con mayúsculas', { name: 'Promo' }],
    ['categoría inválida', { category: 'AUTH' }],
    ['variables salteadas', { body: 'Hola {{1}} y luego {{3}} fin', examples: ['a', 'b', 'c'] }],
    ['variable al inicio', { body: '{{1}} te saluda desde la tienda', examples: ['Ana'] }],
    ['sin ejemplos', { examples: [] }],
    ['cuerpo vacío', { body: ' ', examples: [] }],
    ['dos variables seguidas', { body: 'Hola {{1}}{{2}} bienvenido a la tienda', examples: ['a', 'b'] }],
    ['enlace acortado', { buttons: [{ type: 'URL', text: 'Ver', url: 'https://bit.ly/abc' }] }],
    ['imagen sin archivo', { header_type: 'IMAGE' }],
    ['botón http', { buttons: [{ type: 'URL', text: 'Ver', url: 'http://sabero.pe' }] }],
    ['más de 3 botones', { buttons: Array(4).fill({ type: 'QUICK_REPLY', text: 'ok' }) }],
  ])('rechaza %s', (_label, patch) => {
    expect(() => service.buildPayload({ ...valid, ...(patch as object) } as any)).toThrow(BadRequestException);
  });

  it('crea la plantilla en el WABA de la empresa y deja auditoría', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: '123', status: 'PENDING', category: 'MARKETING' } });
    const result = await service.create('company-1', 'user-1', valid);
    expect(mockedAxios.post.mock.calls[0][0]).toContain('/waba-1/message_templates');
    expect(result).toMatchObject({ id: '123', status: 'PENDING' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'whatsapp.template_created' }));
  });

  it('muestra el motivo que da Meta cuando rechaza la creación', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: { error_user_msg: 'Ya existe una plantilla con ese nombre.' } } } });
    await expect(service.create('company-1', 'user-1', valid)).rejects.toThrow('Ya existe una plantilla');
  });

  it('sube la imagen a Meta, la usa como ejemplo del encabezado y la guarda', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'upload:abc' } })
      .mockResolvedValueOnce({ data: { h: '4::handle' } })
      .mockResolvedValueOnce({ data: { id: '123', status: 'PENDING' } });
    await service.create('company-1', 'user-1', { ...valid, header_type: 'IMAGE' }, { buffer: png, originalname: 'a.png', mimetype: 'image/png' });
    expect(mockedAxios.post.mock.calls[0][0]).toContain('/app-1/uploads');
    expect(mockedAxios.post.mock.calls[1][2]).toMatchObject({ headers: expect.objectContaining({ Authorization: 'OAuth token', file_offset: '0' }) });
    const sent: any = mockedAxios.post.mock.calls[2][1];
    expect(sent.components[0]).toEqual({ type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::handle'] } });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('whatsapp_template_media'), expect.arrayContaining(['company-1', 'promo_noviembre', 'image/png']));
  });

  it('rechaza archivos que no son JPG o PNG aunque digan serlo, sin llamar a Meta', async () => {
    await expect(service.create('company-1', 'user-1', { ...valid, header_type: 'IMAGE' }, { buffer: Buffer.from('<svg></svg>'.repeat(5)), originalname: 'a.png', mimetype: 'image/png' })).rejects.toThrow('JPG o PNG');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
