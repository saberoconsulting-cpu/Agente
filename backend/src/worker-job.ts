import type { ClaimedJob } from './infrastructure/prisma/job-claim.repository';
import type { FollowupsService } from './modules/followups/followups.service';
import type { GoogleDriveService } from './modules/google-drive/google-drive.service';
import type { OpportunitiesService } from './modules/opportunities/opportunities.service';

export const WORKER_POLL_INTERVAL_MS = 3000;

export async function processWorkerJob(job: ClaimedJob, handlers: {
  followups: Pick<FollowupsService, 'processDue'>;
  drive: Pick<GoogleDriveService, 'syncAuthorizedFile' | 'syncChangedFiles'>;
  opportunities: Pick<OpportunitiesService, 'reviewFollowupDrafts'>;
}) {
  if (job.job_type === 'followup.process') return handlers.followups.processDue(job.company_id, 25);
  if (job.job_type === 'drive.sync') {
    const fileId = job.payload?.file_id;
    return typeof fileId === 'string' && fileId
      ? handlers.drive.syncAuthorizedFile(job.company_id, fileId)
      : handlers.drive.syncChangedFiles(job.company_id);
  }
  if (job.job_type === 'opportunity.review') return handlers.opportunities.reviewFollowupDrafts(job.company_id);
  throw new Error('Unsupported worker job type');
}
