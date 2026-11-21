import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  companyId: string;
}

export const tenantContext = new AsyncLocalStorage<TenantContext>();

export function currentTenantId(): string | undefined {
  return tenantContext.getStore()?.companyId;
}
