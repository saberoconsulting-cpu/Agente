import { Injectable } from '@nestjs/common';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class SyncService {
  constructor(private readonly queue: QueueService) {}

  async enqueueDriveFileSync(companyId: string) {
    await this.queue.enqueue('drive.sync', companyId, {}, new Date(), 'drive-sync');
    return { accepted: true };
  }
}
