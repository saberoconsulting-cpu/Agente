import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';
import { QueueService } from './modules/queue/queue.service';
import { FollowupsService } from './modules/followups/followups.service';
import { GoogleDriveService } from './modules/google-drive/google-drive.service';
import { OpportunitiesService } from './modules/opportunities/opportunities.service';
import { PlatformService } from './modules/platform/platform.service';
import { TenantService } from './modules/tenancy/tenant.service';
import { tenantContext } from './modules/tenancy/tenant-context';
import { processWorkerJob, WORKER_POLL_INTERVAL_MS } from './worker-job';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const queue = app.get(QueueService);
  const followups = app.get(FollowupsService);
  const drive = app.get(GoogleDriveService);
  const opportunities = app.get(OpportunitiesService);
  const platform = app.get(PlatformService);
  const tenants = app.get(TenantService);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (platform.managed) await platform.company();
      const companies = await tenants.activeCompanyIds();
      for (const companyId of companies.length ? companies : [tenants.defaultCompanyId]) {
        try {
          await tenants.ensure(companyId);
          await tenantContext.run({ companyId }, async () => {
            for (const job of await queue.claim()) {
              try {
                await processWorkerJob(job, { followups, drive, opportunities });
                await queue.complete(job.id);
              } catch (error) {
                await queue.fail(job.id, job.attempts, error instanceof Error ? error.message : String(error));
              }
            }
          });
        } catch (error) {
          console.warn(`Worker tick postponed for ${companyId}`, { error: error instanceof Error ? error.message : 'Dependency unavailable' });
        }
      }
    } catch (error) {
      console.warn('Worker tick postponed', { error: error instanceof Error ? error.message : 'Dependency unavailable' });
    } finally { running = false; }
  };
  const enqueueAll = async () => {
    const companies = await tenants.activeCompanyIds();
    for (const companyId of companies.length ? companies : [tenants.defaultCompanyId]) {
      try {
        await tenants.ensure(companyId);
        await tenantContext.run({ companyId }, async () => {
          await drive.enqueueAllCompanies();
          await opportunities.enqueueReviewAllCompanies();
        });
      } catch (error) {
        console.warn(`Enqueue postponed for ${companyId}`, { error: error instanceof Error ? error.message : 'Dependency unavailable' });
      }
    }
  };
  await enqueueAll();
  await tick();
  setInterval(() => void tick(), WORKER_POLL_INTERVAL_MS);
  setInterval(() => void enqueueAll(), Number(process.env.DRIVE_SYNC_INTERVAL_MS || 900000));
}

void run();
