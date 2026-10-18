import { Injectable } from '@nestjs/common';

@Injectable()
export class SyncService {
  enqueueDriveFileSync() {
    throw new Error('Drive sync queue is not implemented yet');
  }
}
