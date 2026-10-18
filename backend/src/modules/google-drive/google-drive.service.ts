import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { DatabaseService } from '../database/database.service';
import { GoogleOAuthTokenService } from '../integrations/google/google-oauth-token.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export type RegisterDriveFileInput = {
  company_id?: string;
  google_file_id: string;
  name: string;
  mime_type: string;
  web_view_link?: string;
  version?: string;
  modified_time?: string;
};

type DriveFileRow = {
  id: string;
  company_id: string;
  google_file_id: string;
  name: string;
  mime_type: string;
  web_view_link: string | null;
  version: string | null;
  modified_time: string | null;
  sync_status: string;
};

@Injectable()
export class GoogleDriveService implements OnModuleInit, OnModuleDestroy {
  private syncTimer?: NodeJS.Timeout;

  constructor(
    private readonly db: DatabaseService,
    private readonly googleTokens: GoogleOAuthTokenService,
    private readonly knowledge: KnowledgeService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('DRIVE_SYNC_ENABLED') !== 'true') return;

    const intervalMs = Number(this.config.get<string>('DRIVE_SYNC_INTERVAL_MS') || 900000);
    if (intervalMs < 60000) return;

    this.syncTimer = setInterval(() => {
      void this.syncAllCompanies().catch((error) => {
        console.warn('Scheduled Drive sync failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async registerAuthorizedFile(input: RegisterDriveFileInput) {
    const result = await this.db.query<DriveFileRow>(
      `insert into google_drive_files (
         company_id, google_file_id, name, mime_type, web_view_link, version,
         modified_time, sync_status
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'pending')
       on conflict (company_id, google_file_id)
       do update set
         name = excluded.name,
         mime_type = excluded.mime_type,
         web_view_link = excluded.web_view_link,
         version = excluded.version,
         modified_time = excluded.modified_time,
         trashed = false,
         sync_status = 'pending',
         updated_at = now()
       returning *`,
      [
        input.company_id || 'sabero',
        input.google_file_id,
        input.name,
        input.mime_type,
        input.web_view_link || null,
        input.version || null,
        input.modified_time || null,
      ],
    );

    return result.rows[0];
  }

  async listAuthorizedFiles(companyId: string) {
    const result = await this.db.query(
      `select id, google_file_id, name, mime_type, web_view_link, version,
              modified_time, trashed, sync_status, last_synced_at, created_at, updated_at
       from google_drive_files
       where company_id = $1
       order by updated_at desc`,
      [companyId],
    );

    return result.rows;
  }

  async syncAuthorizedFile(companyId: string, id: string) {
    const file = await this.getAuthorizedFile(companyId, id);
    const drive = google.drive({
      version: 'v3',
      auth: await this.googleTokens.getAuthorizedClient(companyId),
    });

    await this.markSyncStatus(id, 'syncing');

    try {
      const metadata = await drive.files.get({
        fileId: file.google_file_id,
        fields: 'id,name,mimeType,webViewLink,version,modifiedTime,trashed',
      });

      if (metadata.data.trashed) {
        await this.markFileDeleted(companyId, file.google_file_id);
        return { ok: true, status: 'deleted' };
      }

      const content = await this.extractTextFromDriveFile(drive, {
        googleFileId: file.google_file_id,
        mimeType: metadata.data.mimeType || file.mime_type,
      });

      const indexed = await this.knowledge.upsertDocumentWithChunks({
        companyId,
        sourceType: 'google_drive',
        sourceId: file.google_file_id,
        title: metadata.data.name || file.name,
        mimeType: metadata.data.mimeType || file.mime_type,
        sourceVersion: metadata.data.version || file.version,
        sourceModifiedAt: metadata.data.modifiedTime || file.modified_time,
        text: content,
        metadata: {
          web_view_link: metadata.data.webViewLink || file.web_view_link,
          google_file_id: file.google_file_id,
        },
      });

      await this.db.query(
        `update google_drive_files
         set name = $1, mime_type = $2, web_view_link = $3, version = $4,
             modified_time = $5, sync_status = 'indexed', last_synced_at = now(),
             updated_at = now()
         where id = $6`,
        [
          metadata.data.name || file.name,
          metadata.data.mimeType || file.mime_type,
          metadata.data.webViewLink || file.web_view_link,
          metadata.data.version || file.version,
          metadata.data.modifiedTime || file.modified_time,
          id,
        ],
      );

      return { ok: true, status: 'indexed', ...indexed };
    } catch (error) {
      await this.markSyncStatus(id, 'error');
      throw error;
    }
  }

  async syncAllCompanies() {
    const companies = await this.db.query<{ company_id: string }>(
      `select distinct company_id
       from google_drive_files
       where trashed = false`,
    );

    const results = [];
    for (const row of companies.rows) {
      results.push(await this.syncChangedFiles(row.company_id));
    }

    return {
      ok: true,
      companies: results.length,
      results,
    };
  }

  async syncChangedFiles(companyId: string) {
    const batchSize = Number(this.config.get<string>('DRIVE_SYNC_BATCH_SIZE') || 10);
    const files = await this.db.query<DriveFileRow>(
      `select *
       from google_drive_files
       where company_id = $1 and trashed = false
       order by coalesce(last_synced_at, created_at) asc
       limit $2`,
      [companyId, Math.min(Math.max(batchSize, 1), 50)],
    );

    const drive = google.drive({
      version: 'v3',
      auth: await this.googleTokens.getAuthorizedClient(companyId),
    });

    const results = [];
    for (const file of files.rows) {
      try {
        const metadata = await this.fetchDriveMetadata(drive, file.google_file_id);
        if (metadata.trashed) {
          await this.markFileDeleted(companyId, file.google_file_id);
          results.push({ id: file.id, google_file_id: file.google_file_id, status: 'deleted' });
          continue;
        }

        const changed = this.hasDriveFileChanged(file, metadata);
        if (!changed && file.sync_status === 'indexed') {
          await this.touchCheckedFile(file.id);
          results.push({ id: file.id, google_file_id: file.google_file_id, status: 'unchanged' });
          continue;
        }

        const synced = await this.syncAuthorizedFile(companyId, file.id);
        results.push({ id: file.id, google_file_id: file.google_file_id, status: synced.status });
      } catch (error) {
        await this.markSyncStatus(file.id, 'error');
        results.push({
          id: file.id,
          google_file_id: file.google_file_id,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.db.query(
      `insert into sync_jobs (company_id, source_type, status, started_at, finished_at)
       values ($1, 'google_drive', 'completed', now(), now())`,
      [companyId],
    );

    return {
      company_id: companyId,
      checked: files.rows.length,
      changed: results.filter((item) => item.status === 'indexed').length,
      deleted: results.filter((item) => item.status === 'deleted').length,
      errors: results.filter((item) => item.status === 'error').length,
      results,
    };
  }

  private async fetchDriveMetadata(
    drive: ReturnType<typeof google.drive>,
    googleFileId: string,
  ) {
    const metadata = await drive.files.get({
      fileId: googleFileId,
      fields: 'id,name,mimeType,webViewLink,version,modifiedTime,trashed',
    });

    return {
      id: metadata.data.id || googleFileId,
      name: metadata.data.name || null,
      mimeType: metadata.data.mimeType || null,
      webViewLink: metadata.data.webViewLink || null,
      version: metadata.data.version || null,
      modifiedTime: metadata.data.modifiedTime || null,
      trashed: Boolean(metadata.data.trashed),
    };
  }

  private hasDriveFileChanged(
    file: DriveFileRow,
    metadata: Awaited<ReturnType<GoogleDriveService['fetchDriveMetadata']>>,
  ) {
    return (
      file.name !== metadata.name ||
      file.mime_type !== metadata.mimeType ||
      file.web_view_link !== metadata.webViewLink ||
      file.version !== metadata.version ||
      normalizeDate(file.modified_time) !== normalizeDate(metadata.modifiedTime)
    );
  }

  private async getAuthorizedFile(companyId: string, id: string): Promise<DriveFileRow> {
    const result = await this.db.query<DriveFileRow>(
      `select *
       from google_drive_files
       where company_id = $1 and id = $2 and trashed = false`,
      [companyId, id],
    );

    if (!result.rowCount) {
      throw new Error('Authorized Drive file not found');
    }

    return result.rows[0];
  }

  private async extractTextFromDriveFile(
    drive: ReturnType<typeof google.drive>,
    input: { googleFileId: string; mimeType: string },
  ) {
    if (input.mimeType === 'application/vnd.google-apps.document') {
      const response = await drive.files.export(
        { fileId: input.googleFileId, mimeType: 'text/plain' },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(response.data as ArrayBuffer).toString('utf8');
    }

    const response = await drive.files.get(
      { fileId: input.googleFileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    );
    const buffer = Buffer.from(response.data as ArrayBuffer);

    if (input.mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const parsed = await parser.getText();
        return parsed.text;
      } finally {
        await parser.destroy();
      }
    }

    if (
      input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const parsed = await mammoth.extractRawText({ buffer });
      return parsed.value;
    }

    throw new Error(`Unsupported Drive file type: ${input.mimeType}`);
  }

  private async markSyncStatus(id: string, status: string) {
    await this.db.query(
      `update google_drive_files set sync_status = $1, updated_at = now() where id = $2`,
      [status, id],
    );
  }

  private async touchCheckedFile(id: string) {
    await this.db.query(
      `update google_drive_files set updated_at = now() where id = $1`,
      [id],
    );
  }

  private async markFileDeleted(companyId: string, googleFileId: string) {
    await this.db.query(
      `update google_drive_files
       set trashed = true, sync_status = 'deleted', updated_at = now()
       where company_id = $1 and google_file_id = $2`,
      [companyId, googleFileId],
    );
    await this.db.query(
      `update knowledge_documents
       set status = 'deleted', updated_at = now()
       where company_id = $1 and source_type = 'google_drive' and source_id = $2`,
      [companyId, googleFileId],
    );
  }
}

function normalizeDate(value?: string | null) {
  return value ? new Date(value).toISOString() : null;
}
