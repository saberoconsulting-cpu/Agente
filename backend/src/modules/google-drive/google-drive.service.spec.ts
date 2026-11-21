/// <reference types="jest" />
import { GoogleDriveService } from './google-drive.service';

describe('Drive file queue and deletion boundary', () => {
  function setup() {
    const db = { query: jest.fn(), conversationLock: jest.fn(async (_tenant: string, _key: string, work: () => Promise<unknown>) => work()) };
    const tokens = { getAuthorizedClient: jest.fn() };
    const knowledge = { upsertDocumentWithChunks: jest.fn() };
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    return { db, tokens, knowledge, queue, service: new GoogleDriveService(db as any, tokens as any, knowledge as any, {} as any, queue as any) };
  }
  it('creates a separate job for each newly chosen file', async () => {
    const s = setup();
    s.db.query.mockResolvedValue({ rows: [{ id: 'file-a', company_id: 'tenant-a' }] });
    await s.service.registerAuthorizedFile({ company_id: 'tenant-a', google_file_id: 'google-a', name: 'a.pdf', mime_type: 'application/pdf' });
    expect(s.queue.enqueue).toHaveBeenCalledWith('drive.sync', 'tenant-a', { file_id: 'file-a' }, expect.any(Date), 'drive-file:file-a');
  });
  it('does not download or recreate a document removed before its queued job starts', async () => {
    const s = setup();
    s.db.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await s.service.syncAuthorizedFile('tenant-a', 'removed-file')).toEqual({ ok: true, status: 'deleted' });
    expect(s.db.conversationLock).toHaveBeenCalledWith('tenant-a', 'drive-file:removed-file', expect.any(Function));
    expect(s.db.query).toHaveBeenCalledWith(expect.any(String), ['tenant-a', 'removed-file']);
    expect(s.tokens.getAuthorizedClient).not.toHaveBeenCalled();
    expect(s.knowledge.upsertDocumentWithChunks).not.toHaveBeenCalled();
  });
});
