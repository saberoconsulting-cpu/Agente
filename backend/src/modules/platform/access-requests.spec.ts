import {ConfigService} from '@nestjs/config';
import {PlatformService} from './platform.service';
import {PlatformController} from './platform.controller';
import axios from 'axios';
jest.mock('axios');
describe('Application access boundary',()=>{
  it('denies company access changes to customer owners and protects SABERO',async()=>{
    const service=new PlatformService(new ConfigService({PLATFORM_ADMIN_COMPANY_ID:'sabero',PLATFORM_ADMIN_EMAILS:'admin@test.pe'}),{} as any);
    await expect(service.companyAccess({email:'client@test.pe',role:'owner',company_id:'client'} as any,'client',{action:'enable',confirmed:true})).rejects.toThrow('administrator required');
    await expect(service.companyAccess({email:'admin@test.pe',role:'owner',company_id:'sabero'} as any,'sabero',{action:'suspend',confirmed:true})).rejects.toThrow('protegida');
  });
  it('allows repeated localhost development checks while keeping the production limit',async()=>{
    const service={accessRequest:jest.fn().mockResolvedValue({received:true})};
    const local=new PlatformController(service as any,{get:()=> 'development'} as any);
    for(let i=0;i<10;i++)await local.submit({ip:'127.0.0.1'} as any,{});
    const production=new PlatformController(service as any,{get:()=> 'production'} as any);
    for(let i=0;i<5;i++)await production.submit({ip:'127.0.0.1'} as any,{});
    expect(()=>production.submit({ip:'127.0.0.1'} as any,{})).toThrow('Demasiadas solicitudes');
  });
  it('uses the explicitly selected customer company after the guard fixes company_id to SABERO',async()=>{
    (axios.request as jest.Mock).mockResolvedValue({data:{status:'active'}});
    const service=new PlatformService(new ConfigService({PLATFORM_ADMIN_COMPANY_ID:'sabero',PLATFORM_ADMIN_EMAILS:'admin@test.pe',PLATFORM_ADMIN_TOKEN:'a'.repeat(64),PLATFORM_API_URL:'http://localhost:3010'}),{} as any);
    await service.accessRequests({email:'admin@test.pe',role:'owner',company_id:'sabero'} as any,'12345678-1234-1234-1234-123456789012',{action:'activate',company_id:'sabero',target_company_id:'tienda',password:'test-passphrase-123'});
    const data=(axios.request as jest.Mock).mock.calls[0][0].data;
    expect(data.company_id).toBe('tienda');
    expect(data.password_hash).toBeUndefined();
    expect(data.password).toBeUndefined();
  });
  it('does not allow a regular owner to read or approve business applications',async()=>{
    const service=new PlatformService(new ConfigService({PLATFORM_ADMIN_COMPANY_ID:'sabero',PLATFORM_ADMIN_EMAILS:'admin@test.pe'}),{} as any);
    const user={email:'cliente@test.pe',role:'owner',company_id:'cliente'} as any;
    await expect(service.accessRequests(user)).rejects.toThrow('administrator required');
    await expect(service.accessRequests(user,'123',{action:'approve'})).rejects.toThrow('administrator required');
  });
  it('keeps public applications disabled in tenant backends',async()=>{
    const service=new PlatformService(new ConfigService({PUBLIC_ACCESS_REQUESTS_ENABLED:'true',COMPANY_ID:'cliente',PLATFORM_ADMIN_COMPANY_ID:'sabero'}),{} as any);
    await expect(service.accessRequest({})).rejects.toThrow('no están disponibles');
  });
  it('limits anonymous submissions without creating or authenticating users',async()=>{
    const service={accessRequest:jest.fn().mockResolvedValue({received:true})};
    const controller=new PlatformController(service as any);
    for(let i=0;i<5;i++) await controller.submit({ip:'test-client'} as any,{});
    expect(()=>controller.submit({ip:'test-client'} as any,{})).toThrow('Demasiadas solicitudes');
    expect(service.accessRequest).toHaveBeenCalledTimes(5);
  });
});
