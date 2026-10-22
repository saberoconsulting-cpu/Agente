import { Controller, Get, Post, Body, Param, Req, HttpCode, HttpException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PublicRoute } from '../security/public.decorator';
import { PlatformService } from './platform.service';
import { CurrentUser } from '../security/current-user.decorator';
import { AuthTokenPayload } from '../auth/token';

@Controller('platform')
export class PlatformController {
  private readonly attempts = new Map<string,{ count:number; expires:number }>();
  constructor(private readonly platform: PlatformService, @Optional() private readonly config?: ConfigService) {}
  @Get('company')
  company() { return this.platform.managed ? this.platform.company() : { products: ['agent'] }; }
  @Get('capabilities')
  capabilities(@CurrentUser() user: AuthTokenPayload) { return { platform_admin: this.platform.isAdministrator(user) }; }
  @Get('admin/companies')
  companies(@CurrentUser() user: AuthTokenPayload) { return this.platform.companies(user); }
  @Post('admin/companies/:id/access')
  companyAccess(@CurrentUser() user: AuthTokenPayload,@Param('id') id:string,@Body() body:Record<string,unknown>){return this.platform.companyAccess(user,id,body);}
  @PublicRoute()
  @Post('access-requests')
  @HttpCode(202)
  submit(@Req() request: Request, @Body() body: Record<string,unknown>) {
    const now=Date.now();
    for (const [key,value] of this.attempts) if(value.expires<now) this.attempts.delete(key);
    const key=request.ip || 'unknown';
    const localDevelopment=this.config?.get<string>('NODE_ENV')==='development'
      && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(key);
    const limit=localDevelopment ? 100 : 5;
    const entry=this.attempts.get(key)||{count:0,expires:now+3600000};
    if(entry.count>=limit || (!this.attempts.has(key)&&this.attempts.size>=5000)) throw new HttpException('Demasiadas solicitudes. Intenta más tarde.',429);
    entry.count++;this.attempts.set(key,entry);
    if(body.website) return {received:true};
    return this.platform.accessRequest(body);
  }
  @Get('admin/access-requests')
  requests(@CurrentUser() user: AuthTokenPayload) { return this.platform.accessRequests(user); }
  @Post('admin/access-requests/:id')
  review(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string, @Body() body:Record<string,unknown>) { return this.platform.accessRequests(user,id,body); }
}
