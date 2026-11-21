import { defer, firstValueFrom } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';
import { currentTenantId, tenantContext } from './tenant-context';

describe('TenantInterceptor', () => {
  const interceptor = new TenantInterceptor();
  const context = (companyId?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: companyId ? { company_id: companyId } : undefined }) }) }) as any;

  it('keeps concurrent controller queries in their authenticated company after async work', async () => {
    const query = () => defer(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return currentTenantId();
    });
    const results = await tenantContext.run({ companyId: 'unrelated' }, () => Promise.all(
      ['company-a', 'company-b'].map(id => firstValueFrom(interceptor.intercept(context(id), { handle: query }))),
    ));
    expect(results).toEqual(['company-a', 'company-b']);
    expect(currentTenantId()).toBeUndefined();
  });

  it('allows public OAuth callbacks to resolve their own tenant', async () => {
    const result = await firstValueFrom(interceptor.intercept(context(), {
      handle: () => defer(async () => tenantContext.run({ companyId: 'oauth-company' }, () => currentTenantId())),
    }));
    expect(result).toBe('oauth-company');
  });
});
