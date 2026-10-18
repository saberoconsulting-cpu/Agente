import 'dotenv/config';
import { Pool } from 'pg';
import { hashPassword } from '../src/modules/auth/password';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const companyId = process.env.ADMIN_COMPANY_ID || process.env.COMPANY_ID || 'sabero';

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(
      `insert into admin_users (company_id, email, password_hash, role, active)
       values ($1, $2, $3, 'owner', true)
       on conflict (email)
       do update set password_hash = excluded.password_hash,
                     company_id = excluded.company_id,
                     active = true,
                     updated_at = now()
       returning id, company_id, email, role`,
      [companyId, email, hashPassword(password)],
    );
    console.log('Admin user ready', result.rows[0]);
  } finally {
    await pool.end();
  }
}

void main();
