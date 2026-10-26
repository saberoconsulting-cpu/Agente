import { ConversationControlService } from './conversation-control.service';

describe('Conversation attention ownership',()=>{
  function setup(){
    let attention:any=null;
    const db={query:jest.fn(async(sql:string,params:any[])=>{
      if(sql.startsWith('select'))return {rowCount:1,rows:[{attention}]};
      attention=JSON.parse(params[2]);return {rowCount:1,rows:[]};
    }),conversationLock:jest.fn(async(_company:string,_conversation:string,work:()=>Promise<unknown>)=>work())};
    const audit={record:jest.fn().mockResolvedValue(undefined)};
    return {service:new ConversationControlService(db as any,audit as any),db,audit};
  }
  it('keeps automatic attention as the default and sends normally',async()=>{
    const {service}=setup();const send=jest.fn().mockResolvedValue('sent');
    expect(await service.get('company-a','chat-a')).toEqual({mode:'auto'});
    expect(await service.sendIfAutomatic('company-a','chat-a',undefined,send)).toBe('sent');
  });
  it('suppresses an in-flight AI answer after a human takes over',async()=>{
    const {service,audit}=setup();const send=jest.fn();
    await service.change('company-a','chat-a','advisor-a','human');
    await service.sendIfAutomatic('company-a','chat-a',undefined,send);
    expect(send).not.toHaveBeenCalled();expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({companyId:'company-a',actorId:'advisor-a'}));
  });
  it('does not send an old answer even if attention was already returned to AI',async()=>{
    const {service}=setup();const send=jest.fn();
    await service.change('company-a','chat-a','advisor-a','human');
    const restored=await service.change('company-a','chat-a','advisor-a','auto');
    await service.sendIfAutomatic('company-a','chat-a',undefined,send);expect(send).not.toHaveBeenCalled();
    await service.sendIfAutomatic('company-a','chat-a',restored.version,send);expect(send).toHaveBeenCalledTimes(1);
  });
  it('prevents a second advisor from taking or releasing another advisor’s chat',async()=>{
    const {service}=setup();await service.change('company-a','chat-a','advisor-a','human');
    await expect(service.change('company-a','chat-a','advisor-b','human')).rejects.toThrow('Otro asesor');
    await expect(service.change('company-a','chat-a','advisor-b','auto')).rejects.toThrow('Otro asesor');
  });
  it('queries attention only inside the authenticated tenant',async()=>{
    const {service,db}=setup();db.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(service.get('company-b','chat-a')).rejects.toThrow('no encontrada');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('company_id=$1'),['company-b','chat-a']);
  });
});
