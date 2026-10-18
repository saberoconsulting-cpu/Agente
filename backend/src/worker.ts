import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { QueueService } from './modules/queue/queue.service';
import { FollowupsService } from './modules/followups/followups.service';
import { GoogleDriveService } from './modules/google-drive/google-drive.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const queue = app.get(QueueService);
  const followups = app.get(FollowupsService);
  const drive = app.get(GoogleDriveService);
  const tick = async () => {
    for (const job of await queue.claim()) {
      try {
        if (job.job_type === 'followup.process') await followups.processDue(job.company_id, 25);
        if (job.job_type === 'drive.sync') await drive.syncChangedFiles(job.company_id);
        await queue.complete(job.id);
      } catch (error) {
        await queue.fail(job.id, job.attempts, error instanceof Error ? error.message : String(error));
      }
    }
  };
  await drive.enqueueAllCompanies();
  await tick();
  setInterval(() => void tick(), 10_000);
  setInterval(() => void drive.enqueueAllCompanies(), Number(process.env.DRIVE_SYNC_INTERVAL_MS || 900000));
}

void run();
