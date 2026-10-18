import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
  const phone = process.argv[2];
  if (!phone) throw new Error('Usage: npm run lead:check -- <whatsapp_number>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(
      `select
         l.id as lead_id,
         l.whatsapp_number,
         l.qualification,
         c.id as conversation_id,
         c.state
       from leads l
       join conversations c on c.lead_id = l.id
       where l.company_id = $1 and l.whatsapp_number = $2
       order by l.updated_at desc
       limit 1`,
      ['sabero', phone],
    );

    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await pool.end();
  }
}

void main();
