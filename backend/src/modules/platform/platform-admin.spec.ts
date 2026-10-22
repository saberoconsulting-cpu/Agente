import { ConfigService } from '@nestjs/config';
import { PlatformService } from './platform.service';
import { DatabaseService } from '../database/database.service';
import { AuthTokenPayload } from '../auth/token';

describe('Platform administrator boundary', () => {
  const service = new PlatformService(new ConfigService({ PLATFORM_ADMIN_EMAILS: 'owner@sabero.test', PLATFORM_ADMIN_COMPANY_ID: 'sabero' }), {} as DatabaseService);
  const owner: AuthTokenPayload = { sub: '1', email: 'owner@sabero.test', company_id: 'sabero', role: 'owner', exp: 9999999999 };
  it('requires explicit email, company and owner role', () => {
    expect(service.isAdministrator(owner)).toBe(true);
    expect(service.isAdministrator({ ...owner, company_id: 'other' })).toBe(false);
    expect(service.isAdministrator({ ...owner, email: 'client@test.com' })).toBe(false);
    expect(service.isAdministrator({ ...owner, role: 'admin' })).toBe(false);
  });
  it('rejects a tenant owner before contacting the global platform', async () => {
    await expect(service.companies({ ...owner, company_id: 'other' })).rejects.toThrow('Platform administrator required');
  });
});
