/// <reference types="jest" />
import { Prisma } from '@prisma/client';
import { QueueService } from './queue.service';

describe('QueueService terminal job recovery', () => {
  function setup() {
    const jobs = { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    return { jobs, queue: new QueueService({ jobQueue: jobs } as any, {} as any) };
  }

  it('releases the dedupe key when a job exhausts retries so future requests can run', async () => {
    const { jobs, queue } = setup();
    await queue.fail('old-job', 5, 'provider failed');
    expect(jobs.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'dead', dedupeKey: null }) }));
  });

  it('retains deduplication while a failed job is still scheduled for retry', async () => {
    const { jobs, queue } = setup();
    await queue.fail('retrying-job', 2, 'temporary failure');
    expect(jobs.update.mock.calls[0][0].data).not.toHaveProperty('dedupeKey');
    expect(jobs.update.mock.calls[0][0].data.status).toBe('pending');
  });

  it('reactivates a legacy dead job only for the requested tenant, type and key', async () => {
    const { jobs, queue } = setup();
    jobs.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.0' }));
    const runAt = new Date();
    await queue.enqueue('drive.sync', 'company-a', { file_id: 'new-file' }, runAt, 'drive-sync');
    expect(jobs.updateMany).toHaveBeenCalledWith({
      where: { jobType: 'drive.sync', companyId: 'company-a', dedupeKey: 'drive-sync', status: { in: ['dead', 'completed'] } },
      data: expect.objectContaining({ status: 'pending', attempts: 0, payload: { file_id: 'new-file' }, runAt, errorMessage: null, lockedAt: null, lockExpiresAt: null, completedAt: null }),
    });
  });

  it('does not conceal database errors unrelated to deduplication', async () => {
    const { jobs, queue } = setup();
    jobs.create.mockRejectedValue(new Error('database unavailable'));
    await expect(queue.enqueue('drive.sync', 'company-a')).rejects.toThrow('database unavailable');
    expect(jobs.updateMany).not.toHaveBeenCalled();
  });
});
