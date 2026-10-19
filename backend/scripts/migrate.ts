import 'dotenv/config';
import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Pool } from 'pg';

type Migration = { version: string; filename: string; sql: string; checksum: string };
const migrationsDir = process.env.MIGRATIONS_DIR || join(process.cwd(), 'database', 'migrations');
const lockId = 4815162342;

async function loadMigrations(): Promise<Migration[]> {
  const files = (await readdir(migrationsDir)).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort();
  if (!files.length) throw new Error(`No migrations found in ${migrationsDir}`);
  return Promise.all(files.map(async (filename) => {
    const sql = await readFile(join(migrationsDir, filename), 'utf8');
    return { version: filename.slice(0, 4), filename, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

function pool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : {
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
    },
  });
}

async function main() {
  const db = pool();
  try {
    const migrations = await loadMigrations();
    await db.query('select pg_advisory_lock($1)', [lockId]);
    await db.query(`create table if not exists schema_migrations (
      version text primary key, filename text not null, checksum text not null, applied_at timestamptz not null default now()
    )`);
    const applied = await db.query<{ version: string; checksum: string }>('select version, checksum from schema_migrations');
    const known = new Map(applied.rows.map((row) => [row.version, row.checksum]));
    for (const migration of migrations) {
      const checksum = known.get(migration.version);
      if (checksum && checksum !== migration.checksum) throw new Error(`Migration ${migration.filename} was modified after being applied`);
      if (checksum) continue;
      await db.query('begin');
      try {
        await db.query(migration.sql);
        await db.query('insert into schema_migrations (version, filename, checksum) values ($1, $2, $3)', [migration.version, migration.filename, migration.checksum]);
        await db.query('commit');
        known.set(migration.version, migration.checksum);
        console.log(`Applied ${migration.filename}`);
      } catch (error) {
        await db.query('rollback');
        throw error;
      }
    }
    if (process.argv.includes('--status')) console.log(migrations.map((migration) => `${known.has(migration.version) ? 'applied' : 'pending'} ${migration.filename}`).join('\n'));
  } finally {
    await db.query('select pg_advisory_unlock($1)', [lockId]).catch(() => undefined);
    await db.end();
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
