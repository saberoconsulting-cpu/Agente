// Validates the deployed deletion SQL against temporary fixtures, then ROLLS BACK everything.
// Never deletes an existing user document or calls Google Drive.
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const appRequire = createRequire(path.resolve('package.json'));
const { ConfigService } = appRequire('@nestjs/config');
const { DatabaseService } = appRequire(path.resolve('dist/src/modules/database/database.service.js'));
const { TenantService } = appRequire(path.resolve('dist/src/modules/tenancy/tenant.service.js'));
const { RecordsController } = appRequire(path.resolve('dist/src/modules/platform/records.controller.js'));
const { KnowledgeService } = appRequire(path.resolve('dist/src/modules/knowledge/knowledge.service.js'));
const config = new ConfigService(process.env);
const tenants = new TenantService(config);
const db = new DatabaseService(config, tenants);
const companyId = tenants.defaultCompanyId;
(async () => {
  try {
    await db.conversationLock(companyId, `validation:${randomUUID()}`, async () => {
      await db.query('BEGIN');
      try {
        const fileId = randomUUID(), documentId = randomUUID(), chunkId = randomUUID(), referenceId = randomUUID(), jobId = randomUUID();
        const googleId = `validation-${fileId}`;
        await db.query("insert into google_drive_files(id,company_id,google_file_id,name,mime_type,sync_status) values($1,$2,$3,'Temporary deletion validation','application/pdf','indexed')", [fileId, companyId, googleId]);
        await db.query("insert into knowledge_documents(id,company_id,source_type,source_id,title) values($1,$2,'google_drive',$3,'Temporary deletion validation')", [documentId, companyId, googleId]);
        await db.query("insert into knowledge_chunks(id,company_id,document_id,chunk_index,content) values($1,$2,$3,0,'Temporary validation text')", [chunkId, companyId, documentId]);
        await db.query("insert into knowledge_embeddings(company_id,chunk_id,provider,model,embedding) values($1,$2,'local-hash','validation',$3::vector)", [companyId, chunkId, `[${Array(1536).fill(0).join(',')}]`]);
        await db.query('insert into knowledge_references(id,company_id,document_id,chunk_id) values($1,$2,$3,$4)', [referenceId, companyId, documentId, chunkId]);
        await db.query("insert into job_queue(id,company_id,job_type,dedupe_key,payload,run_at) values($1,$2,'drive.sync',$3,$4::jsonb,now()+interval '1 day')", [jobId, companyId, `drive-file:${fileId}`, JSON.stringify({ file_id: fileId })]);
        // The outer advisory lock owns this transaction's connection; validate the
        // controller SQL on that connection without acquiring a second connection.
        const controller = new RecordsController({ query: (...args) => db.query(...args), conversationLock: async (_company, _key, work) => work() }, {});
        const knowledge = new KnowledgeService({ query: (...args) => db.query(...args) }, { embedText: async () => Array(1536).fill(0) }, config);
        await knowledge.upsertDocumentWithChunks({ companyId, sourceType: 'google_drive', sourceId: googleId, title: 'Temporary deletion validation', mimeType: 'application/pdf', text: 'Replacement validation text' });
        const replaced = await db.query(`select
          (select count(*) from knowledge_chunks where id=$1) as old_chunks,
          (select count(*) from knowledge_embeddings where chunk_id=$1) as old_vectors,
          (select chunk_id is null and document_id=$2 from knowledge_references where id=$3) as reference_preserved`, [chunkId, documentId, referenceId]);
        if (Number(replaced.rows[0].old_chunks) || Number(replaced.rows[0].old_vectors) || !replaced.rows[0].reference_preserved) throw new Error('Replacement validation failed');
        console.log('KNOWLEDGE_REPLACEMENT_VALIDATED: previous chunks and vectors removed; document history retained.');
        const fixtureChunks = await db.query('select id from knowledge_chunks where company_id=$1 and document_id=$2', [companyId, documentId]);
        const chunkIds = [chunkId, ...fixtureChunks.rows.map(row => row.id)];
        await controller.remove({ company_id: companyId, role: 'owner' }, 'files', fileId);
        const result = await db.query(`select
          (select count(*) from knowledge_documents where id=$1) as documents,
          (select count(*) from knowledge_chunks where id=any($2::uuid[])) as chunks,
          (select count(*) from knowledge_embeddings where chunk_id=any($2::uuid[])) as embeddings,
          (select count(*) from knowledge_references where id=$3) as refs,
          (select count(*) from job_queue where id=$4) as jobs,
          (select trashed from google_drive_files where id=$5) as removed`, [documentId, chunkIds, referenceId, jobId, fileId]);
        const row = result.rows[0];
        console.log('KNOWLEDGE_DELETION_COUNTS', JSON.stringify(row));
        if (!row.removed || ['documents', 'chunks', 'embeddings', 'refs', 'jobs'].some(key => Number(row[key]) !== 0)) throw new Error('Deletion validation failed');
        console.log('KNOWLEDGE_DELETION_VALIDATED: document, text, vectors, references and queued job removed.');
      } finally {
        await db.query('ROLLBACK');
        console.log('VALIDATION_ROLLED_BACK: existing user data unchanged.');
      }
    });
  } catch (error) { console.error('KNOWLEDGE_DELETION_VALIDATION_FAILED', error.code || error.name); process.exitCode = 1; }
  finally { await db.onModuleDestroy(); await tenants.onModuleDestroy(); }
})();
