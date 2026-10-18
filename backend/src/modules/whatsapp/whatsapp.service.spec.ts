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
});
