// Read-only diagnosis using the application's exact tenant and TLS configuration.
const { createRequire } = require('node:module');
const appRequire = createRequire('/app/package.json');
const { ConfigService } = appRequire('@nestjs/config');
const { DatabaseService } = appRequire('/app/dist/src/modules/database/database.service.js');
const { TenantService } = appRequire('/app/dist/src/modules/tenancy/tenant.service.js');
const { tenantContext } = appRequire('/app/dist/src/modules/tenancy/tenant-context.js');
const config = new ConfigService(process.env);
const tenants = new TenantService(config);
const db = new DatabaseService(config, tenants);
const companyId = process.env.COMPANY_ID || 'sabero';
const safe = value => String(value || '').replace(/https?:\/\/\S+/g, '[URL]').replace(/Bearer\s+\S+/gi, '[credencial]').replace(/(?:access_token|refresh_token|password|secret)\s*[:=]\s*\S+/gi, '[credencial]').slice(0, 500);
(async () => {
  try {
    const ids = await tenants.activeCompanyIds();
    console.log('WORKER_TENANTS', JSON.stringify({ defaultCompany: companyId, defaultIncluded: ids.includes(companyId), activeCount: ids.length }));
    await tenants.ensure(companyId);
    await tenantContext.run({ companyId }, async () => {
      const jobs = await db.query("select status,attempts,run_at,locked_at,lock_expires_at,dedupe_key,error_message from job_queue where company_id=$1 and job_type='drive.sync' order by created_at desc limit 8", [companyId]);
      console.log('DRIVE_JOBS', JSON.stringify(jobs.rows.map(row => ({ ...row, error_message: safe(row.error_message) }))));
      const files = await db.query("select name,sync_status,last_synced_at,updated_at from google_drive_files where company_id=$1 and not trashed order by updated_at desc limit 4", [companyId]);
      console.log('DRIVE_FILES', JSON.stringify(files.rows));
    });
  } catch (error) { console.log('DIAG_ERROR', safe(error.message)); process.exitCode = 1; }
  finally { await db.onModuleDestroy(); await tenants.onModuleDestroy(); }
})();
