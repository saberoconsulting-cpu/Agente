import { LeadsService } from './leads.service';

describe('Contacts pagination', () => {
  it('returns 10 contacts per page within the requested company and filters', async () => {
    const rows = Array.from({ length: 10 }, (_, id) => ({ id, total_count: 23 }));
    const repo = { list: jest.fn().mockResolvedValue({ rows }) };
    const result = await new LeadsService(repo as any).roster('tenant-a', { page: '2', search: 'Ana' });
    expect(repo.list).toHaveBeenCalledWith('tenant-a', 10, expect.objectContaining({ offset: 10, search: 'Ana' }));
    expect(result).toMatchObject({ page: 2, pages: 3, total: 23 });
    expect(result.items).toHaveLength(10);
  });

  it('moves to the last remaining page after its final contact is removed', async () => {
    const repo = { list: jest.fn().mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total_count: 20 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'last', total_count: 20 }] }) };
    const result = await new LeadsService(repo as any).roster('tenant-a', { page: '3' });
    expect(result).toMatchObject({ page: 2, pages: 2, total: 20 });
    expect(repo.list).toHaveBeenLastCalledWith('tenant-a', 10, expect.objectContaining({ offset: 10 }));
  });

  it('returns the first page for an empty list after deletion', async () => {
    const repo = { list: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await new LeadsService(repo as any).roster('tenant-a', { page: '2' })).toMatchObject({ items: [], page: 1, pages: 1, total: 0 });
  });
});
