/// <reference types="jest" />
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PasswordRecoveryService } from './password-recovery.service';
import { hashPassword, verifyPassword } from './password';
import { AuthService } from './auth.service';
import { TenantService } from '../tenancy/tenant.service';

const tenantsStub = {
  defaultCompanyId: 'sabero',
  isRouted: () => false,
  ensure: async () => undefined,
  companyForEmail: async () => null,
  candidateCompanyIds: () => ['sabero'],
  poolFor: () => undefined,
  prismaFor: () => undefined,
} as unknown as TenantService;

describe('Password recovery', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  function setup() {
    const user = { id: 'cba9b424-19c9-4903-b9bd-f6a82a464156', companyId: 'company-a', email: 'owner@example.test', active: true, passwordHash: hashPassword('previous-password') };
    let row: any = null;
    let recent = { count: 0n, latest: null as Date | null };
    const tx = {
      $queryRaw: jest.fn(async (sql: TemplateStringsArray, ...values: any[]) => {
        const text = sql.join('?');
        if (text.includes('count(*)')) return [recent];
        if (text.includes('insert into password_reset_codes')) {
          row = { id: 'reset-id', code_hash: values[1], attempts: 0, expires_at: new Date(Date.now() + 600000), used_at: null };
          recent = { count: recent.count + 1n, latest: new Date() };
          return [{ id: row.id }];
        }
        if (text.includes('code_hash,attempts')) return row ? [row] : [];
        return [{ id: user.id }];
      }),
      $executeRaw: jest.fn(async (sql: TemplateStringsArray) => {
        if (row && sql.join('?').includes('attempts=attempts+1')) row.attempts++;
        else if (row) row.used_at = new Date();
        return 1;
      }),
      adminUser: { updateMany: jest.fn(async ({ data }) => { user.passwordHash = data.passwordHash; return { count: 1 }; }) },
      authSession: { updateMany: jest.fn(async () => ({ count: 2 })) },
    };
    const prisma = { adminUser: { findFirst: jest.fn(async () => ({ ...user })) }, $transaction: jest.fn(async (work: any) => work(tx)), $executeRaw: tx.$executeRaw };
    const config = new ConfigService({ AUTH_SECRET: 's'.repeat(64), BREVO_API_KEY: 'test-only-key', BREVO_SENDER_EMAIL: 'sender@example.test' });
    const service = new PasswordRecoveryService(prisma as unknown as PrismaService, config, tenantsStub);
    const fetcher = jest.fn(async () => ({ ok: true, json: async () => ({ messageId: 'test-receipt' }) }));
    global.fetch = fetcher as unknown as typeof fetch;
    const code = () => JSON.parse((fetcher.mock.calls as any)[0][1].body).textContent.match(/\b\d{6}\b/)[0];
    return { service, prisma, tx, user, fetcher, code, row: () => row, setRecent: (value: typeof recent) => { recent = value; } };
  }

  it('sends the code only to the stored account email and stores only a keyed hash', async () => {
    const s = setup();
    await s.service.request('OWNER@example.test');
    const body = JSON.parse((s.fetcher.mock.calls as any)[0][1].body);
    expect(body.to).toEqual([{ email: s.user.email }]);
    expect(s.row().code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(s.row().code_hash).not.toEqual(s.code());
    expect(s.prisma.adminUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ active: true }) }));
  });

  it('does not disclose an unknown account or send it an email', async () => {
    const s = setup();
    const existing = await s.service.request(s.user.email);
    s.prisma.adminUser.findFirst.mockResolvedValueOnce(null as any);
    expect(await s.service.request('unknown@example.test')).toEqual(existing);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });

  it('enforces the resend cooldown and the account request limit', async () => {
    const s = setup();
    await s.service.request(s.user.email);
    await s.service.request(s.user.email);
    s.setRecent({ count: 5n, latest: new Date(Date.now() - 120000) });
    await s.service.request(s.user.email);
    expect(s.fetcher).toHaveBeenCalledTimes(1);
  });

  it('resets the password, consumes the code and revokes existing sessions', async () => {
    const s = setup();
    await s.service.request(s.user.email);
    await s.service.reset(s.user.email, s.code(), 'a-new-secure-password');
    expect(verifyPassword('a-new-secure-password', s.user.passwordHash)).toBe(true);
    expect(s.row().used_at).toBeInstanceOf(Date);
    expect(s.tx.authSession.updateMany).toHaveBeenCalledWith({ where: { userId: s.user.id, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    await expect(s.service.reset(s.user.email, s.code(), 'another-secure-password')).rejects.toThrow('El código no es válido');
    expect(s.tx.adminUser.updateMany).toHaveBeenCalledTimes(1);
  });

  it('persists failed attempts and rejects the correct code after five failures', async () => {
    const s = setup();
    await s.service.request(s.user.email);
    const wrong = s.code() === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await expect(s.service.reset(s.user.email, wrong, 'a-new-secure-password')).rejects.toThrow('El código no es válido');
    expect(s.row().attempts).toBe(5);
    await expect(s.service.reset(s.user.email, s.code(), 'a-new-secure-password')).rejects.toThrow();
    expect(s.tx.adminUser.updateMany).not.toHaveBeenCalled();
  });

  it('rejects expired codes and passwords outside the allowed length', async () => {
    const s = setup();
    await s.service.request(s.user.email);
    s.row().expires_at = new Date(Date.now() - 1000);
    await expect(s.service.reset(s.user.email, s.code(), 'a-new-secure-password')).rejects.toThrow('El código no es válido');
    await expect(s.service.reset(s.user.email, s.code(), 'short')).rejects.toThrow('entre 12 y 128');
    await expect(s.service.reset(s.user.email, s.code(), 'a'.repeat(129))).rejects.toThrow('entre 12 y 128');
  });

  it('invalidates an undelivered code without disclosing provider errors', async () => {
    const s = setup();
    s.fetcher.mockResolvedValueOnce({ ok: false, json: async () => ({ messageId: '' }) });
    const result = await s.service.request(s.user.email);
    expect(result.message).toContain('Si el correo');
    expect(s.row().used_at).toBeInstanceOf(Date);
  });

  it('requires the current password and scopes changes to the signed-in account', async () => {
    const s = setup();
    const user = { sub: s.user.id, company_id: 'company-a', email: s.user.email, role: 'owner', exp: 9999999999 };
    await expect(s.service.change(user, 'wrong-password', 'a-new-secure-password')).rejects.toThrow('actual no es correcta');
    expect(s.tx.adminUser.updateMany).not.toHaveBeenCalled();
    await s.service.change(user, 'previous-password', 'a-new-secure-password');
    expect(s.prisma.adminUser.findFirst).toHaveBeenCalledWith({ where: { id: user.sub, companyId: user.company_id, active: true } });
    expect(verifyPassword('a-new-secure-password', s.user.passwordHash)).toBe(true);
  });

  it('rejects a previously signed access token when its session was revoked', async () => {
    const prisma = { authSession: { findFirst: jest.fn(async () => null) }, adminUser: { findFirst: jest.fn() } };
    const service = new AuthService(prisma as unknown as PrismaService, new ConfigService(), tenantsStub);
    await expect(service.meForPayload({ sub: 'user', sid: 'revoked-session', company_id: 'company-a', email: 'owner@example.test', role: 'owner', exp: 9999999999 })).rejects.toThrow('La sesión venció');
    expect(prisma.adminUser.findFirst).not.toHaveBeenCalled();
  });
});
