import {isSupportedCountry,parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {notificationSchema,queueNotification} from './access-notifications.mjs';

export const accessRequestSchema = `CREATE TABLE IF NOT EXISTS platform_access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_name text NOT NULL, contact_name text NOT NULL,
 email text NOT NULL, phone text NOT NULL, origin_company_id text NOT NULL REFERENCES platform_companies(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','active','rejected')),
 company_id text REFERENCES platform_companies(id), payment_reference text, reviewed_by text,
 reviewed_at timestamptz, activated_by text, activated_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_access_requests ADD COLUMN IF NOT EXISTS phone_country text;
ALTER TABLE platform_access_requests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE platform_access_requests ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE platform_access_requests ADD COLUMN IF NOT EXISTS password_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS platform_access_requests_open_email ON platform_access_requests(lower(email)) WHERE status <> 'rejected';` + notificationSchema;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const fields = 'id,business_name,contact_name,email,phone,phone_country,status,company_id,payment_reference,reviewed_by,reviewed_at,activated_by,activated_at,created_at,rejection_reason,(password_hash IS NOT NULL) AS has_password';
export function requestInput(body) {
  const value = {};
  for (const [key, max] of [['business_name',150],['contact_name',120],['email',254],['phone',40]]) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > max) fail(`Invalid ${key}`);
    value[key] = body[key].trim();
  }
  value.email = value.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) || !/^[+\d\s().-]+$/.test(value.phone)) fail('Invalid email or phone');
  const country=body.phone_country;
  if(country!==undefined&&(typeof country!=='string'||!isSupportedCountry(country)))fail('Invalid phone country');
  if(!country&&!value.phone.startsWith('+'))fail('International phone required');
  const parsed=parsePhoneNumberFromString(value.phone,{defaultCountry:country,extract:false});
  if(!parsed?.isValid()||parsed.ext||(country&&parsed.country!==country&&!parsed.getPossibleCountries().includes(country)))fail('Phone does not match country');
  value.phone=parsed.number;
  value.phone_country=country||parsed.country||null;
  return value;
}
export async function submitRequest(registry, origin, body) {
  const value = requestInput(body);
  if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(body.password_hash||''))fail('Registration password required');
  await registry.control.query(`INSERT INTO platform_access_requests(business_name,contact_name,email,phone,origin_company_id,phone_country,password_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [value.business_name,value.contact_name,value.email,value.phone,origin,value.phone_country,body.password_hash]);
  // Same response for new and duplicate requests; never disclose existing accounts.
  return { received: true };
}
export async function listRequests(registry) {
  return { items: (await registry.control.query(`SELECT ${fields},
    (SELECT jsonb_build_object('status',n.status,'decision',n.decision,'error_code',n.error_code,'sent_at',n.sent_at,'attempts',n.attempts)
      FROM platform_access_notifications n WHERE n.request_id=platform_access_requests.id AND n.decision=platform_access_requests.status) AS notification
    FROM platform_access_requests WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 200`)).rows };
}
export async function reviewRequest(registry, id, body) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) fail('Invalid request');
  if (!['approve','reject','activate'].includes(body.action) || typeof body.actor !== 'string' || body.actor.length > 254) fail('Invalid review');
  const control = await registry.control.connect();
  try {
    await control.query('BEGIN');
    const row = (await control.query('SELECT * FROM platform_access_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id])).rows[0];
    if (!row) fail('Request not found',404);
    if (body.action === 'approve') {
      if (row.status !== 'pending' || body.payment_confirmed !== true || typeof body.payment_reference !== 'string' || !body.payment_reference.trim() || body.payment_reference.length > 200) fail('Confirm payment with a reference before approval',409);
      await control.query(`UPDATE platform_access_requests SET status='approved',payment_reference=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$1`, [id,body.payment_reference.trim(),body.actor]);
    } else if (body.action === 'reject') {
      if (!['pending','approved'].includes(row.status)) fail('Request cannot be rejected',409);
      if(body.rejection_reason!==undefined && (typeof body.rejection_reason!=='string'||body.rejection_reason.length>1000))fail('Invalid rejection reason');
      await control.query(`UPDATE platform_access_requests SET status='rejected',reviewed_by=$2,reviewed_at=now(),rejection_reason=$3,updated_at=now() WHERE id=$1`, [id,body.actor,body.rejection_reason?.trim() || null]);
    } else {
      if (row.status !== 'approved' || !row.payment_reference) fail('Payment approval is required',409);
      if (typeof body.company_id !== 'string' || body.company_id === row.origin_company_id) fail('Select a separate company and a valid password');
      if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(row.password_hash||''))fail('Esta solicitud antigua no tiene contraseña de registro. La empresa debe registrarse de nuevo después de rechazar la solicitud anterior.',409);
      const company = (await control.query(`SELECT c.* FROM platform_companies c JOIN platform_products p ON p.company_id=c.id
        WHERE c.id=$1 AND c.status='active' AND p.product='agent' AND p.status='active'`, [body.company_id])).rows[0];
      if (!company) fail('Company agent is not prepared',409);
      const tenant = await registry.database(company);
      // Never replace an existing owner or put a customer in the SABERO company.
      const client = await tenant.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
        const existing = await client.query(`SELECT u.id FROM platform.agent_access_activations a JOIN agent.admin_users u ON u.id=a.user_id
          WHERE a.request_id=$1 AND u.company_id=$2 AND u.email=$3 AND u.role='owner' AND u.active=true`,[id,company.id,row.email]);
        if (!existing.rowCount) {
          const inserted = await client.query(`INSERT INTO agent.admin_users(company_id,email,password_hash,role,active)
            VALUES($1,$2,$3,'owner',true) ON CONFLICT DO NOTHING RETURNING id`, [company.id,row.email,row.password_hash]);
          if (!inserted.rowCount) fail('An account already exists; review it without overwriting its credentials',409);
          await client.query('INSERT INTO platform.agent_access_activations(request_id,user_id) VALUES($1,$2)',[id,inserted.rows[0].id]);
        }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      await control.query(`UPDATE platform_access_requests SET status='active',company_id=$2,activated_by=$3,activated_at=now(),updated_at=now() WHERE id=$1`, [id,company.id,body.actor]);
    }
    const result = (await control.query(`SELECT ${fields} FROM platform_access_requests WHERE id=$1`, [id])).rows[0];
    await queueNotification(control,result);
    await control.query('COMMIT');
    return result;
  } catch (error) { await control.query('ROLLBACK'); throw error; }
  finally { control.release(); }
}
