import {accessRequestPhone} from './access-request-phone';
describe('International business phones',()=>{
  it.each([
    ['PE','912345678','+51912345678'],['MX','5512345678','+525512345678'],
    ['AR','+5491123456789','+5491123456789'],['BR','11987654321','+5511987654321'],
    ['CL','221234567','+56221234567'],['CO','3001234567','+573001234567'],
    ['US','2025550123','+12025550123'],['CA','4165550123','+14165550123'],
    ['ES','612345678','+34612345678'],
  ])('normalizes %s', (country,national,international)=>{
    expect(accessRequestPhone(national,country)).toEqual({phone:international,phone_country:country});
  });
  it('does not mix Canada and the United States even though both use +1',()=>{
    expect(()=>accessRequestPhone('+14165550123','US')).toThrow();
    expect(()=>accessRequestPhone('+12025550123','CA')).toThrow();
  });
  it('rejects invalid, ambiguous local, embedded or extension numbers',()=>{
    for(const value of ['123','912345678','Call +51912345678','+51912345678 ext 5'])expect(()=>accessRequestPhone(value)).toThrow();
    expect(()=>accessRequestPhone('+51912345678','XX')).toThrow();
    expect(accessRequestPhone('+51 912 345 678')).toEqual({phone:'+51912345678',phone_country:'PE'});
  });
});
