import { RecordsController } from './records.controller';

describe('Record deletion boundary', () => {
  const id='12345678-1234-1234-1234-123456789012';
  const owner={sub:'owner-id',company_id:'tenant-a',email:'owner@example.test',role:'owner'} as any;
  function harness() {
    const db={query:jest.fn().mockResolvedValue({rowCount:1,rows:[{id}]})};
    const platform={removeRecord:jest.fn().mockResolvedValue({removed:true})};
    return {db,platform,controller:new RecordsController(db as any,platform as any)};
  }
  it('scopes removal to the authenticated tenant and rejects arbitrary tables',async()=>{
    const h=harness();
    await h.controller.remove(owner,'contacts',id);
    expect(h.db.query).toHaveBeenCalledWith(expect.stringContaining('where company_id=$1 and id=$2'),['tenant-a',id]);
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
  it('withdraws a document and its indexed status without deleting the Drive original',async()=>{
    const h=harness();await h.controller.remove(owner,'files',id);
    const sql=h.db.query.mock.calls[0][0];
    expect(sql).toContain('set trashed=true');expect(sql).toContain("set status='deleted'");
    expect(h.db.query.mock.calls[0][1]).toEqual(['tenant-a',id]);
  });
  it('reports missing records and blocks removal of linked histories',async()=>{
    const h=harness();h.db.query.mockResolvedValueOnce({rowCount:0,rows:[]});
    await expect(h.controller.remove(owner,'contacts',id)).rejects.toThrow('protegido');
    h.db.query.mockRejectedValueOnce({code:'23503'});
    await expect(h.controller.remove(owner,'contacts',id)).rejects.toThrow('vinculados');
  });
  it('delegates global changes to the administrator authorization boundary',async()=>{
    const h=harness();await h.controller.remove(owner,'companies','another-company');
    expect(h.platform.removeRecord).toHaveBeenCalledWith(owner,'companies','another-company');
    expect(h.db.query).not.toHaveBeenCalled();
  });
});
