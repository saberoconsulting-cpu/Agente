/// <reference types="jest" />
import { processWorkerJob } from './worker-job';

describe('Worker job dispatch', () => {
  function setup() {
    return {
      drive: { syncAuthorizedFile: jest.fn().mockResolvedValue({ status: 'indexed' }), syncChangedFiles: jest.fn().mockResolvedValue({}) },
      followups: { processDue: jest.fn().mockResolvedValue({}) },
      opportunities: { reviewFollowupDrafts: jest.fn().mockResolvedValue({}) },
    };
  }
  const job = { id: 'job', job_type: 'drive.sync', company_id: 'tenant-a', attempts: 1, payload: { file_id: 'chosen-file' } } as const;
  it('processes only the newly selected file instead of scanning the tenant batch', async () => {
    const handlers = setup();
    await processWorkerJob(job, handlers as any);
    expect(handlers.drive.syncAuthorizedFile).toHaveBeenCalledWith('tenant-a', 'chosen-file');
    expect(handlers.drive.syncChangedFiles).not.toHaveBeenCalled();
  });
  it('keeps full synchronization for periodic jobs without a file id', async () => {
    const handlers = setup();
    await processWorkerJob({ ...job, payload: {} }, handlers as any);
    expect(handlers.drive.syncChangedFiles).toHaveBeenCalledWith('tenant-a');
    expect(handlers.drive.syncAuthorizedFile).not.toHaveBeenCalled();
  });
  it('propagates a file failure so the queue can record it and retry', async () => {
    const handlers = setup();
    handlers.drive.syncAuthorizedFile.mockRejectedValue(new Error('Drive unavailable'));
    await expect(processWorkerJob(job, handlers as any)).rejects.toThrow('Drive unavailable');
  });
  it('preserves the follow-up handler for sales jobs', async () => {
    const handlers = setup();
    await processWorkerJob({ ...job, job_type: 'followup.process' }, handlers as any);
    expect(handlers.followups.processDue).toHaveBeenCalledWith('tenant-a', 25);
    expect(handlers.drive.syncAuthorizedFile).not.toHaveBeenCalled();
  });
});
