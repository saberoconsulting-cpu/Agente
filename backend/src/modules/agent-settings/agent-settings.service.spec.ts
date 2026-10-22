import { AgentSettingsService } from './agent-settings.service';
describe('Optional company appointments', () => {
  it('persists an explicit false for the authenticated company', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ company_id: 'tienda' }] }) };
    await new AgentSettingsService(db as any).update('tienda', { scheduling_enabled: false });
    expect(db.query.mock.calls[1][1]).toEqual(['tienda', 'scheduling_enabled', 'false', true]);
  });
  it('rejects strings that might accidentally enable appointments', async () => {
    const db = { query: jest.fn() };
    await expect(new AgentSettingsService(db as any).update('tienda', { scheduling_enabled: 'false' as any })).rejects.toThrow('must be boolean');
    expect(db.query).not.toHaveBeenCalled();
  });
});
