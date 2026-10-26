import { ContactWorkspaceService } from './contact-workspace.service';

describe('Contact workspace operations',()=>{
  const user={sub:'advisor-a',company_id:'company-a',email:'advisor@example.com',role:'owner'} as any;
  const input={request_id:'00000000-0000-4000-8000-000000000001',text:'Hola, podemos ayudarte.'};
  function setup(options:{human?:boolean;window?:boolean;duplicate?:'sent'|'uncertain'}={}){
    let hash='';
    const db={query:jest.fn(async(sql:string,params:any[])=>{
      if(sql.includes('insert into contact_outbound_requests')){hash=params[4];return {rowCount:options.duplicate?0:1,rows:[]};}
      if(sql.includes('select status,payload_hash'))return {rowCount:1,rows:[{status:options.duplicate,payload_hash:hash,provider_message_id:'provider-a'}]};
      return {rowCount:0,rows:[]};
    }),conversationLock:jest.fn(async(_company:string,_conversation:string,work:()=>Promise<unknown>)=>work())};
    const messages={summary:jest.fn().mockResolvedValue(options.window===false?[]:[{lastMessageAt:new Date()}]),attachment:jest.fn().mockResolvedValue(null)};
    const control={get:jest.fn().mockResolvedValue({mode:options.human===false?'auto':'human',assignee_id:'advisor-a'})};
    const whatsapp={sendOperator:jest.fn().mockResolvedValue({provider_message_id:'provider-a'}),downloadMedia:jest.fn()};
    const opportunities={note:jest.fn().mockResolvedValue({}),changeStage:jest.fn().mockResolvedValue({})};
    const audit={record:jest.fn().mockResolvedValue(undefined)};
    const service=new ContactWorkspaceService(db as any,messages as any,control as any,whatsapp as any,opportunities as any,{} as any,{} as any,{} as any,{} as any,audit as any,{} as any);
    jest.spyOn(service,'lead').mockResolvedValue({id:'lead-a',whatsapp_number:'51900000000'});
    jest.spyOn(service,'conversation').mockResolvedValue({id:'chat-a'});
    return {service,db,messages,control,whatsapp,opportunities,audit};
  }
  it('requires explicit human takeover before sending',async()=>{
    const {service,whatsapp}=setup({human:false});
    await expect(service.send('company-a','lead-a',user,input)).rejects.toThrow('Toma la conversación');expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
  it('blocks free text outside the 24-hour window before reaching Meta',async()=>{
    const {service,whatsapp}=setup({window:false});
    await expect(service.send('company-a','lead-a',user,input)).rejects.toThrow('24 horas');expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
  it('passes template messages to the provider’s approval validation outside the window',async()=>{
    const {service,whatsapp}=setup({window:false});
    await service.send('company-a','lead-a',user,{...input,template_name:'contacto',language:'es',parameters:[]});
    expect(whatsapp.sendOperator).toHaveBeenCalledWith('company-a','51900000000',expect.objectContaining({template_name:'contacto'}),'advisor@example.com');
  });
  it('does not resend a provider-accepted request on browser retry',async()=>{
    const {service,whatsapp}=setup({duplicate:'sent'});
    await expect(service.send('company-a','lead-a',user,input)).resolves.toMatchObject({duplicate:true});expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
  it('does not blindly repeat a request whose provider acceptance is uncertain',async()=>{
    const {service,whatsapp}=setup({duplicate:'uncertain'});
    await expect(service.send('company-a','lead-a',user,input)).rejects.toThrow('no está confirmado');expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
  it('keeps internal notes in the existing opportunity and never sends them',async()=>{
    const {service,opportunities,whatsapp}=setup();jest.spyOn(service as any,'opportunity').mockResolvedValue('opportunity-a');
    await service.note('company-a','lead-a',user,'Nota privada','Llamar el martes');
    expect(opportunities.note).toHaveBeenCalledWith('company-a','opportunity-a','advisor-a','Nota privada','Llamar el martes');expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
  it('never downloads arbitrary media that is absent from the contact’s stored conversation',async()=>{
    const {service,whatsapp}=setup();
    await expect(service.download('company-a','lead-a','chat-a','message-a')).rejects.toThrow('Archivo no encontrado');expect(whatsapp.downloadMedia).not.toHaveBeenCalled();
  });
  it('blocks opt-outs before claiming or sending a message',async()=>{
    const {service,db,whatsapp}=setup();db.query.mockResolvedValueOnce({rowCount:1,rows:[{} as any]});
    await expect(service.send('company-a','lead-a',user,input)).rejects.toThrow('pidió no recibir');expect(whatsapp.sendOperator).not.toHaveBeenCalled();
  });
});
