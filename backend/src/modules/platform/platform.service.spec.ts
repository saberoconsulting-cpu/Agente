import axios from 'axios';
import { PlatformService } from './platform.service';

describe('PlatformService failures', () => {
  const values: Record<string, string> = { PLATFORM_API_URL: 'http://platform:3010', PLATFORM_SERVICE_TOKEN: 'private-service-token', COMPANY_ID: 'company' };
  const config = { get: (key: string) => values[key] };
  afterEach(() => jest.restoreAllMocks());
  it('removes credentials from dependency errors', async () => {
    jest.spyOn(axios, 'request').mockRejectedValue({ isAxiosError: true, config: { headers: { Authorization: 'Bearer private-service-token' } } });
    const service = new PlatformService(config as any, {} as any);
    await expect(service.request('GET', '/v1/company')).rejects.toThrow('Platform temporarily unavailable');
    try { await service.request('GET', '/v1/company'); } catch (error) {
      expect(JSON.stringify(error)).not.toContain('private-service-token');
    }
  });
  it('keeps disabled products forbidden', async () => {
    jest.spyOn(axios, 'request').mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    const service = new PlatformService(config as any, {} as any);
    await expect(service.request('GET', '/v1/company')).rejects.toMatchObject({ status: 403 });
  });
});
