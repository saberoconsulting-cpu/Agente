import { WhatsappService } from './whatsapp.service';

describe('WhatsappService connection resolution', () => {
  function createService(connection?: any) {
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          COMPANY_ID: 'sabero',
          META_ACCESS_TOKEN: 'global-token',
          META_PHONE_NUMBER_ID: 'global-phone',
        };
        return values[key];
      }),
    };
    const connections = {
      findActiveByPhoneNumberId: jest.fn().mockResolvedValue(connection || null),
      findActiveForCompany: jest.fn().mockResolvedValue(connection || null),
      decryptAccessToken: jest.fn().mockReturnValue('tenant-token'),
    };
    const service = new WhatsappService(
      config as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      connections as any,
      {} as any,
      { managed: false, assertCompany: jest.fn() } as any,
    );

    return { service, config, connections };
  }

  it('resolves inbound company from the webhook phone_number_id', async () => {
    const { service, connections } = createService({
      company_id: 'tenant-1',
      phone_number_id: 'phone-1',
    });

    await expect((service as any).resolveCompanyId('phone-1')).resolves.toBe('tenant-1');
    expect(connections.findActiveByPhoneNumberId).toHaveBeenCalledWith('phone-1');
  });

  it('falls back to the legacy global company when no connection matches', async () => {
    const { service } = createService();

    await expect((service as any).resolveCompanyId('unknown-phone')).resolves.toBe('sabero');
  });

  it('uses tenant credentials when a company has an active connection', async () => {
    const { service, connections } = createService({
      company_id: 'tenant-1',
      phone_number_id: 'tenant-phone',
      encrypted_access_token: 'encrypted-token',
    });

    await expect((service as any).resolveSendCredentials('tenant-1')).resolves.toEqual({
      token: 'tenant-token',
      phoneNumberId: 'tenant-phone',
    });
    expect(connections.decryptAccessToken).toHaveBeenCalled();
  });

  it('falls back to legacy global credentials when a tenant connection is absent', async () => {
    const { service } = createService();

    await expect((service as any).resolveSendCredentials('tenant-1')).resolves.toEqual({
      token: 'global-token',
      phoneNumberId: 'global-phone',
    });
  });

  it('accepts WHATSAPP_ACCESS_TOKEN when META_ACCESS_TOKEN is absent', async () => {
    const { service, config } = createService();
    config.get.mockImplementation((key: string) => ({
      WHATSAPP_ACCESS_TOKEN: 'permanent-token',
      WHATSAPP_TOKEN: 'legacy-token',
      WHATSAPP_PHONE_NUMBER_ID: 'real-phone',
    } as Record<string, string>)[key]);
    await expect((service as any).resolveSendCredentials()).resolves.toEqual({
      token: 'permanent-token', phoneNumberId: 'real-phone',
    });
  });

  it('routes a received message to the agent and sends its answer', async () => {
    const { service } = createService();
    const agent = { respondToMessage: jest.fn().mockResolvedValue({ answer: 'Hola desde SABERO' }) };
    (service as any).salesAgent = agent;
    const send = jest.spyOn(service as any, 'sendText').mockResolvedValue(undefined);
    await (service as any).processInboundMessage(
      { id: 'inbound-1', from: '51900000000', text: { body: 'Hola' } },
      { conversationId: 'conversation-1', leadId: 'lead-1' },
    );
    expect(agent.respondToMessage).toHaveBeenCalledWith({ companyId: 'sabero', message: 'Hola',
      conversationId: 'conversation-1', leadId: 'lead-1', inboundMessageId: 'inbound-1' });
    expect(send).toHaveBeenCalledWith('51900000000', 'Hola desde SABERO', 'sabero');
  });

  it('does not generate another answer for a duplicate webhook message', async () => {
    const { service } = createService();
    jest.spyOn(service as any, 'saveInboundEvent').mockResolvedValue('event-1');
    jest.spyOn(service as any, 'upsertInboundMessage').mockResolvedValue({ inserted: false });
    const process = jest.spyOn(service as any, 'processInboundMessage').mockResolvedValue(undefined);
    await service.receiveWebhook({ entry: [{ changes: [{ value: { messages: [
      { id: 'duplicate', from: '51900000000', type: 'text', text: { body: 'Hola' } },
    ] } }] }] });
    expect(process).not.toHaveBeenCalled();
  });
});
