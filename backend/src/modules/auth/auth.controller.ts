import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { PublicRoute } from '../security/public.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @PublicRoute()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, '') || '';
    return this.auth.me(token);
  }

  @Get('users')
  users(
    @Headers('authorization') authorization?: string,
    @Query('company_id') companyId = 'sabero',
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '') || '';
    return this.auth.listUsers(token, companyId);
  }

  @Post('users')
  createUser(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { company_id?: string; email: string; password: string; role?: string },
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, '') || '';
    return this.auth.createUser({
      requesterToken: token,
      companyId: body.company_id || 'sabero',
      email: body.email,
      password: body.password,
      role: body.role,
    });
  }
}
