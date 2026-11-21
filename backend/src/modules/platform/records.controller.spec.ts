/// <reference types="jest" />
import { RecordsController } from './records.controller';

describe('Record deletion boundary', () => {
  const id='12345678-1234-1234-1234-123456789012';
  const owner={sub:'owner-id',company_id:'tenant-a',email:'owner@example.test',role:'owner'} as any;
  function harness() {
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{id}]}),conversationLock:jest.fn(async (_company:string,_key:string,work:()=>Promise<unknown>)=>work())};
    const platform={removeRecord:jest.fn().mockResolvedValue({removed:true})};
    return {db,platform,controller:new RecordsController(db as any,platform as any)};
  }
  it.each([undefined, {}, {reason:'   '}, {reason:42}, {reason:'x'.repeat(1001)}])('requires a valid reason before removing a contact',async(body)=>{
    const h=harness();
    await expect(h.controller.remove(owner,'contacts',id,body)).rejects.toThrow('motivo');
    expect(h.db.query).not.toHaveBeenCalled();
  });
  it('scopes removal to the authenticated tenant and rejects arbitrary tables',async()=>{
    const h=harness();
    await h.controller.remove(owner,'contacts',id,{reason:'Contacto de prueba'});
    expect(h.db.query).toHaveBeenCalledWith(expect.stringContaining('where company_id=$1 and id=$2'),['tenant-a',id,owner.sub,'Contacto de prueba',owner.email]);
    await expect(h.controller.remove(owner,'admin_users',id)).rejects.toThrow('Lista no disponible');
    expect(h.db.query).toHaveBeenCalledTimes(1);
  });
  it('protects the current user and owners; removing an access also revokes sessions',async()=>{
    const h=harness();
    await expect(h.controller.remove({...owner,sub:id},'users',id)).rejects.toThrow('propio acceso');
    await expect(h.controller.remove({...owner,role:'admin'},'users',id)).rejects.toThrow('propietario');
    expect(h.db.query).not.toHaveBeenCalled();
    await h.controller.remove(owner,'users',id);
    expect(h.db.query.mock.calls[0][0]).toContain("role<>'owner'");
    expect(h.db.query.mock.calls[0][0]).toContain('update auth_sessions set revoked_at=now()');
  });
  it('removes a contact from the list and cancels scheduled followups without deleting its history',async()=>{
    const h=harness();
    await h.controller.remove(owner,'contacts',id,{reason:'Contacto de prueba'});
    const sql=h.db.query.mock.calls[0][0];
    expect(sql).toContain("update leads set status='deleted'");
    expect(sql).toContain("update followups set status='cancelled'");
    expect(sql).toContain("status='scheduled'");
    expect(sql).not.toContain('delete from');
    expect(sql).toContain('insert into audit_logs');
    expect(sql).toContain('contact.deleted');
    expect(h.db.query.mock.calls[0][1]).toEqual(['tenant-a',id,owner.sub,'Contacto de prueba',owner.email]);
  });
  it('purges document content and its references under the same lock used by indexing',async()=>{
    const h=harness();await h.controller.remove(owner,'files',id);
    const sql=h.db.query.mock.calls[0][0];
    expect(sql).toContain('set trashed=true');expect(sql).toContain('delete from knowledge_documents');
    expect(sql).toContain('delete from knowledge_references');expect(sql).toContain('delete from job_queue');
    expect(sql).toContain('delete from knowledge_embeddings');expect(sql).toContain('delete from knowledge_chunks');
    expect(h.db.conversationLock).toHaveBeenCalledWith('tenant-a',`drive-file:${id}`,expect.any(Function));
    expect(h.db.query.mock.calls[0][1]).toEqual(['tenant-a',id]);
  });
  it('reports missing records and blocks removal of linked histories',async()=>{
    const h=harness();h.db.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(h.controller.remove(owner,'contacts',id,{reason:'Contacto de prueba'})).rejects.toThrow('protegido');
    h.db.query.mockRejectedValueOnce({code:'23503'});
    await expect(h.controller.remove(owner,'contacts',id,{reason:'Contacto de prueba'})).rejects.toThrow('vinculados');
  });
  it('delegates global changes to the administrator authorization boundary',async()=>{
    const h=harness();await h.controller.remove(owner,'companies','another-company');
    expect(h.platform.removeRecord).toHaveBeenCalledWith(owner,'companies','another-company');
    expect(h.db.query).not.toHaveBeenCalled();
  });
});
