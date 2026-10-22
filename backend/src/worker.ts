import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { QueueService } from './modules/queue/queue.service';
import { FollowupsService } from './modules/followups/followups.service';
import { GoogleDriveService } from './modules/google-drive/google-drive.service';
import { OpportunitiesService } from './modules/opportunities/opportunities.service';
import { PlatformService } from './modules/platform/platform.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const queue = app.get(QueueService);
  const followups = app.get(FollowupsService);
  const drive = app.get(GoogleDriveService);
  const opportunities = app.get(OpportunitiesService);
  const platform = app.get(PlatformService);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
    if (platform.managed) await platform.company();
    for (const job of await queue.claim()) {
      try {
        if (job.job_type === 'followup.process') await followups.processDue(job.company_id, 25);
        if (job.job_type === 'drive.sync') await drive.syncChangedFiles(job.company_id);
        if (job.job_type === 'opportunity.review') await opportunities.reviewFollowupDrafts(job.company_id);
        await queue.complete(job.id);
      } catch (error) {
        await queue.fail(job.id, job.attempts, error instanceof Error ? error.message : String(error));
      }
    }
    } catch (error) {
      console.warn('Worker tick postponed', { error: error instanceof Error ? error.message : 'Dependency unavailable' });
    } finally { running = false; }
  };
  await drive.enqueueAllCompanies();
  await opportunities.enqueueReviewAllCompanies();
  await tick();
  setInterval(() => void tick(), 10_000);
  setInterval(() => void drive.enqueueAllCompanies(), Number(process.env.DRIVE_SYNC_INTERVAL_MS || 900000));
  setInterval(() => void opportunities.enqueueReviewAllCompanies(), 15 * 60 * 1000);
}

void run();
