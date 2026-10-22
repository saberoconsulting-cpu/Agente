import { phone } from './domain.mjs';

export async function upsertContact(pool, product, input) {
  if (typeof input.externalId !== 'string' || !input.externalId || input.externalId.length > 200) throw new Error('externalId is required');
  const number = phone(input.phone);
  const name = typeof input.name === 'string' ? input.name.slice(0, 200) : null;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase().slice(0, 255) : null;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Serialize contact identity assignment for this company, including cross-product races.
    await db.query("SELECT pg_advisory_xact_lock(hashtext('platform.contacts'))");
    const linked = await db.query(`SELECT c.* FROM platform.contacts c JOIN platform.contact_links l ON l.contact_id=c.id
      WHERE l.product=$1 AND l.external_id=$2`, [product, input.externalId]);
    let contact;
    let changed = false;
    if (linked.rows[0]) {
      const existing = linked.rows[0];
      const crm = await db.query("SELECT 1 FROM platform.contact_links WHERE contact_id=$1 AND product='crm'", [existing.id]);
      const effectivePhone = product === 'agent' && crm.rowCount ? existing.phone || number : number || existing.phone;
      const collision = effectivePhone && await db.query('SELECT id FROM platform.contacts WHERE phone=$1 AND id<>$2', [effectivePhone, existing.id]);
      if (collision?.rowCount) throw Object.assign(new Error('Phone belongs to another contact; explicit merge required'), { status: 409 });
      const effectiveName = product === 'agent' && crm.rowCount ? existing.name || name : name || existing.name;
      const effectiveEmail = product === 'agent' && crm.rowCount ? existing.email || email : email || existing.email;
      changed = effectivePhone !== existing.phone || effectiveName !== existing.name || effectiveEmail !== existing.email;
      if (changed) ({ rows: [contact] } = await db.query(`UPDATE platform.contacts SET phone=$2,name=$3,email=$4,updated_at=now() WHERE id=$1 RETURNING *`, [existing.id, effectivePhone, effectiveName, effectiveEmail]));
      else contact = existing;
    } else {
      const match = number ? await db.query('SELECT * FROM platform.contacts WHERE phone=$1', [number]) : { rows: [] };
      contact = match.rows[0];
      if (!contact) ({ rows: [contact] } = await db.query('INSERT INTO platform.contacts(phone,name,email) VALUES($1,$2,$3) RETURNING *', [number, name, email]));
      else if (product === 'crm') ({ rows: [contact] } = await db.query('UPDATE platform.contacts SET name=coalesce($2,name),email=coalesce($3,email),updated_at=now() WHERE id=$1 RETURNING *', [contact.id, name, email]));
      await db.query('INSERT INTO platform.contact_links(product,external_id,contact_id) VALUES($1,$2,$3)', [product, input.externalId, contact.id]);
      changed = true;
    }
    if (changed) await db.query(`INSERT INTO platform.contact_inbox(product,contact_id) VALUES($1,$2)
      ON CONFLICT(product,contact_id) DO UPDATE SET version=gen_random_uuid()`, [product === 'agent' ? 'crm' : 'agent', contact.id]);
    await db.query('COMMIT');
    return contact;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
