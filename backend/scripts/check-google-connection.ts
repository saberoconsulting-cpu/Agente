import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(
      `select
         company_id,
         provider_account_email,
         scopes,
         connected_at,
         revoked_at,
         length(encrypted_tokens) as encrypted_token_length
       from google_oauth_connections
       where company_id = $1`,
      ['sabero'],
    );

    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await pool.end();
  }
}

void main();
