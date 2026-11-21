import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { TenantService } from '../tenancy/tenant.service';
import { tenantContext } from '../tenancy/tenant-context';
import { hashPassword, verifyPassword } from './password';
import { AuthTokenPayload } from './token';

const genericReply = { message: 'Si el correo tiene una cuenta activa, recibirás un código para recuperar tu contraseña. Revisa también la carpeta de spam.' };
type ResetCode = { id: string; code_hash: string; attempts: number; expires_at: Date; used_at: Date | null };

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly tenants: TenantService) {}

  private async forEmail<T>(email: string, work: () => Promise<T>): Promise<T> {
    const routed = await this.tenants.companyForEmail(email);
    const companyId = routed ?? this.tenants.defaultCompanyId;
    await this.tenants.ensure(companyId);
    return tenantContext.run({ companyId }, work);
  }

  private email(value: unknown) {
    if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new BadRequestException('Ingresa un correo válido.');
    return value.trim().toLowerCase();
  }

  private validatePassword(value: unknown): asserts value is string {
    if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw new BadRequestException('La contraseña debe tener entre 12 y 128 caracteres.');
  }

  private digest(userId: string, code: string) {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is required');
    return createHmac('sha256', secret).update(`password-reset:${userId}:${code}`).digest('hex');
  }

  async request(emailInput: unknown) {
    const email = this.email(emailInput);
    return this.forEmail(email, () => this.requestInTenant(email));
  }

  private async requestInTenant(email: string) {
    const user = await this.prisma.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, active: true } });
    if (!user) return genericReply;
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = this.digest(user.id, code);
    const id = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`select id from admin_users where id=${user.id}::uuid for update`;
      const recent = await tx.$queryRaw<{ count: bigint; latest: Date | null }[]>`select count(*) as count,max(created_at) as latest from password_reset_codes where user_id=${user.id}::uuid and created_at > now()-interval '15 minutes'`;
      if (Number(recent[0]?.count) >= 5 || (recent[0]?.latest && Date.now() - recent[0].latest.getTime() < 60000)) return null;
      await tx.$executeRaw`update password_reset_codes set used_at=now() where user_id=${user.id}::uuid and used_at is null`;
      const rows = await tx.$queryRaw<{ id: string }[]>`insert into password_reset_codes(user_id,code_hash,expires_at) values(${user.id}::uuid,${codeHash},now()+interval '10 minutes') returning id`;
      return rows[0].id;
    });
    if (!id) return genericReply;
    try { await this.sendCode(user.email, code); }
    catch {
      await this.prisma.$executeRaw`update password_reset_codes set used_at=now() where id=${id}::uuid`;
      this.logger.warn('Password recovery email was not accepted by the mail provider.');
    }
    return genericReply;
  }

  async reset(emailInput: unknown, codeInput: unknown, password: unknown) {
    const email = this.email(emailInput);
    this.validatePassword(password);
    const invalid = () => new BadRequestException('El código no es válido o ha vencido. Solicita uno nuevo.');
    if (typeof codeInput !== 'string' || !/^\d{6}$/.test(codeInput)) throw invalid();
    return this.forEmail(email, () => this.resetInTenant(email, codeInput, password));
  }

  private async resetInTenant(email: string, codeInput: string, password: string) {
    const invalid = () => new BadRequestException('El código no es válido o ha vencido. Solicita uno nuevo.');
    const user = await this.prisma.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, active: true } });
    if (!user) throw invalid();
    const success = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`select id from admin_users where id=${user.id}::uuid for update`;
      const rows = await tx.$queryRaw<ResetCode[]>`select id,code_hash,attempts,expires_at,used_at from password_reset_codes where user_id=${user.id}::uuid order by created_at desc limit 1 for update`;
      const row = rows[0];
      if (!row || row.used_at || row.attempts >= 5 || row.expires_at.getTime() <= Date.now()) return false;
      const expected = Buffer.from(row.code_hash, 'hex');
      const actual = Buffer.from(this.digest(user.id, codeInput), 'hex');
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        await tx.$executeRaw`update password_reset_codes set attempts=attempts+1 where id=${row.id}::uuid`;
        return false;
      }
      const updated = await tx.adminUser.updateMany({ where: { id: user.id, active: true, passwordHash: user.passwordHash }, data: { passwordHash: hashPassword(password), updatedAt: new Date() } });
      if (updated.count !== 1) return false;
      await tx.$executeRaw`update password_reset_codes set used_at=now() where user_id=${user.id}::uuid and used_at is null`;
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return true;
    });
    if (!success) throw invalid();
    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.' };
  }

  async change(user: AuthTokenPayload, current: unknown, password: unknown) {
    this.validatePassword(password);
    if (typeof current !== 'string' || current.length > 128) throw new BadRequestException('Ingresa tu contraseña actual.');
    await this.tenants.ensure(user.company_id);
    return tenantContext.run({ companyId: user.company_id }, () => this.changeInTenant(user, current, password));
  }

  private async changeInTenant(user: AuthTokenPayload, current: string, password: string) {
    const account = await this.prisma.adminUser.findFirst({ where: { id: user.sub, companyId: user.company_id, active: true } });
    if (!account || !verifyPassword(current, account.passwordHash)) throw new UnauthorizedException('La contraseña actual no es correcta.');
    if (verifyPassword(password, account.passwordHash)) throw new BadRequestException('Elige una contraseña diferente de la actual.');
    await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`select id from admin_users where id=${account.id}::uuid for update`;
      const updated = await tx.adminUser.updateMany({ where: { id: account.id, active: true, passwordHash: account.passwordHash }, data: { passwordHash: hashPassword(password), updatedAt: new Date() } });
      if (updated.count !== 1) throw new UnauthorizedException('La cuenta cambió. Vuelve a iniciar sesión.');
      await tx.authSession.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.$executeRaw`update password_reset_codes set used_at=now() where user_id=${account.id}::uuid and used_at is null`;
    });
    return { message: 'Contraseña actualizada. Inicia sesión de nuevo.' };
  }

  private async sendCode(email: string, code: string) {
    const key = this.config.get<string>('BREVO_API_KEY');
    const sender = this.config.get<string>('BREVO_SENDER_EMAIL');
    if (!key || !sender) throw new Error('Mail provider is not configured');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: this.config.get<string>('BREVO_SENDER_NAME') || 'SABERO', email: sender },
        to: [{ email }], subject: 'Tu código para recuperar el acceso a SABERO',
        textContent: `Tu código de recuperación es: ${code}\n\nVence en 10 minutos y solo se puede utilizar una vez.\nNo lo compartas con nadie. Si no solicitaste este cambio, ignora este correo.\n\nSABERO`,
      }),
    });
    if (!response.ok) throw new Error('Mail provider rejected the message');
    const receipt = await response.json() as { messageId?: string };
    if (!receipt.messageId) throw new Error('Missing mail receipt');
  }
}
