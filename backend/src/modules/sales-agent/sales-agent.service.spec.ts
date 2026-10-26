import { SalesAgentService } from './sales-agent.service';

describe('SalesAgentService conversation context', () => {
  function setup(schedulingEnabled = false, pipelineMode = 'services') {
    const db = { query: jest.fn().mockImplementation(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('from company_agent_settings')) return { rowCount: 1, rows: [{ agent_name: 'SABERO', language: 'es', tone: 'consultivo', system_rules: '', scheduling_enabled: schedulingEnabled, pipeline_mode: pipelineMode }] };
      if (sql.includes('select state')) return { rows: [{ state: {} }] };
      return { rows: [], rowCount: 0 };
    }) };
    const ai = { complete: jest.fn().mockResolvedValue({ content: 'Respuesta', provider: 'deepseek', model: 'test' }) };
    const store = { list: jest.fn().mockResolvedValue({ items: [
      { direction: 'inbound', textBody: 'Necesito un CRM', providerMessageId: 'old' },
      { direction: 'outbound', textBody: '¿Para cuántos usuarios?', providerMessageId: 'reply' },
      { direction: 'inbound', textBody: 'Cinco', providerMessageId: 'current' },
    ] }) };
    const service = new SalesAgentService(db as any, ai as any,
      { searchTextByCompany: jest.fn().mockResolvedValue([]) } as any,
      { record: jest.fn() } as any, store as any);
    return { service, ai, store, db };
  }

  it('includes both sides of the conversation and the current message once', async () => {
    const { service, ai, store } = setup();
    await service.respondToMessage({ companyId: 'sabero', conversationId: 'conversation', message: 'Cinco', inboundMessageId: 'current' });
    expect(store.list).toHaveBeenCalledWith('sabero', 'conversation', 30);
    expect(ai.complete.mock.calls[0][0].messages.slice(1)).toEqual([
      { role: 'user', content: 'Necesito un CRM' },
      { role: 'assistant', content: '¿Para cuántos usuarios?' },
      { role: 'user', content: 'Cinco' },
    ]);
  });

  it('supports a request without a conversation', async () => {
    const { service, ai, store } = setup();
    await service.respondToMessage({ companyId: 'sabero', message: 'Hola' });
    expect(store.list).not.toHaveBeenCalled();
    expect(ai.complete.mock.calls[0][0].messages.slice(1)).toEqual([{ role: 'user', content: 'Hola' }]);
  });

  it('uses the product sales process even when meeting settings were previously enabled', async () => {
    const { db, ai, store } = setup(true, 'products');
    const scheduling = { respond: jest.fn() };
    const service = new SalesAgentService(db as any, ai as any, { searchTextByCompany: jest.fn().mockResolvedValue([]) } as any, {} as any, store as any, scheduling as any);
    await service.respondToMessage({ companyId: 'sabero', message: 'Quiero comprar un producto' });
    expect(scheduling.respond).not.toHaveBeenCalled();
    expect(ai.complete.mock.calls[0][0].messages[0].content).toContain('Esta empresa no ofrece agenda');
  });

  it('creates a card and updates classification for messages handled by the booking flow', async () => {
    const { db, ai, store } = setup(true);
    const scheduling = { respond: jest.fn().mockResolvedValue('¿Qué día te viene bien?') };
    const pipeline = { ensure: jest.fn().mockResolvedValue(undefined), sync: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesAgentService(db as any, ai as any, {} as any, {} as any, store as any, scheduling as any, pipeline as any);
    const input = { companyId: 'sabero', conversationId: 'chat', leadId: 'lead', message: 'Quiero una reunión' };
    await service.respondToMessage(input);
    expect(pipeline.ensure).toHaveBeenCalledWith(input);
    expect(pipeline.sync).toHaveBeenCalledWith(input);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('does not invoke scheduling for a business without appointments', async () => {
    const { db, ai, store } = setup();
    const scheduling = { respond: jest.fn() };
    const service = new SalesAgentService(db as any, ai as any, { searchTextByCompany: jest.fn().mockResolvedValue([]) } as any, {} as any, store as any, scheduling as any);
    await service.respondToMessage({ companyId: 'tienda', message: 'Quiero comprar una mochila' });
    expect(scheduling.respond).not.toHaveBeenCalled();
    expect(ai.complete.mock.calls[0][0].messages[0].content).toContain('Esta empresa no ofrece agenda');
  });

  it('keeps the real scheduling flow available for an enabled company', async () => {
    const { db, ai, store } = setup(true);
    const scheduling = { respond: jest.fn().mockResolvedValue('¿Por la mañana o por la tarde?') };
    const service = new SalesAgentService(db as any, ai as any, {} as any, {} as any, store as any, scheduling as any);
    const response = await service.respondToMessage({ companyId: 'sabero', message: 'Quiero una reunión' });
    expect(scheduling.respond).toHaveBeenCalled();
    expect(ai.complete).not.toHaveBeenCalled();
    expect(response.answer).toBe('¿Por la mañana o por la tarde?');
  });

  it('keeps the supplied contact email in the correct company for manual onboarding', async () => {
    const { service, db } = setup();
    await service.respondToMessage({ companyId: 'empresa-a', leadId: 'lead-a', message: 'Mi correo es cliente@negocio.pe' });
    const update = db.query.mock.calls.find(([sql]) => sql.includes('update leads'));
    expect(update?.[1]).toEqual(['empresa-a', 'lead-a', JSON.stringify({ email: 'cliente@negocio.pe' })]);
  });
});
