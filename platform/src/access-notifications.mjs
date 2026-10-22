const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export const notificationSchema = `CREATE TABLE IF NOT EXISTS platform_access_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES platform_access_requests(id) ON DELETE CASCADE,
 decision text NOT NULL CHECK(decision IN ('approved','rejected','active')), payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped','superseded')),
 attempts integer NOT NULL DEFAULT 0, error_code text, message_id text, sent_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,decision)
);`;

export function notificationMessage(payload, env) {
  const content = {
    approved: ['Tu solicitud fue aprobada', 'Hemos aprobado la solicitud de tu empresa. Estamos preparando la habilitación de tu acceso y te avisaremos cuando esté listo.'],
    rejected: ['Actualización de tu solicitud', 'Tras revisar la solicitud de tu empresa, en esta ocasión no podremos habilitar el acceso. Si necesitas más información, puedes responder a este correo.'],
    active: ['Tu acceso a SABERO AI está habilitado', 'El acceso de tu empresa ya está habilitado. Para ingresar, usa el correo y la contraseña que elegiste al registrarte. Nuestro equipo te proporcionará la dirección de tu panel por el canal acordado.'],
  }[payload.decision];
  if (!content) throw new Error('Invalid notification decision');
  const [title, description] = content;
  const greeting = `Hola ${payload.contact_name || 'equipo'},`;
  const reason = payload.decision === 'rejected' && payload.rejection_reason ? `Motivo: ${payload.rejection_reason}` : '';
  const textContent = [greeting, title, payload.business_name, description, reason, 'SABERO Consulting', env.BREVO_REPLY_TO || env.BREVO_SENDER_EMAIL].filter(Boolean).join('\n\n');
  return {
    sender: {name: env.BREVO_SENDER_NAME || 'SABERO Consulting', email: env.BREVO_SENDER_EMAIL},
    replyTo: {email: env.BREVO_REPLY_TO || env.BREVO_SENDER_EMAIL, name: 'SABERO Consulting'},
    to: [{email: payload.email, name: payload.contact_name}],
    subject: `${title} · SABERO AI`,
    textContent,
    htmlContent: `<!doctype html><html lang="es"><body style="margin:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#233047"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:40px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:white;border:1px solid #e3eaf2;border-radius:20px"><tr><td style="padding:32px"><p style="margin:0;color:#087fff;font-size:13px;font-weight:bold;letter-spacing:2px">SABERO AI</p><p style="margin:8px 0 28px;color:#718096;font-size:12px">Sales Engine · SABERO Consulting</p><p>${escapeHtml(greeting)}</p><h1 style="font-size:25px;line-height:1.3;color:#10223f">${escapeHtml(title)}</h1><p style="font-size:15px;font-weight:bold">${escapeHtml(payload.business_name)}</p><p style="font-size:15px;line-height:1.8">${escapeHtml(description)}</p>${reason ? `<p style="padding:16px;background:#f5f7fb;border-radius:10px;font-size:14px;line-height:1.7;white-space:pre-wrap">${escapeHtml(reason)}</p>` : ''}<p style="margin-top:32px;padding-top:24px;border-top:1px solid #e7edf4;font-size:12px;line-height:1.7;color:#718096">¿Necesitas ayuda? Responde a este correo.<br>SABERO Consulting</p></td></tr></table></td></tr></table></body></html>`,
    tags: ['solicitudes-empresas', payload.decision],
  };
}

export async function queueNotification(client, application) {
  // Only these fields may leave the control database. Never include password hashes or payment references.
  const payload = Object.fromEntries(['business_name','contact_name','email','rejection_reason'].map(key => [key, application[key]]));
  payload.decision = application.status;
  await client.query(`UPDATE platform_access_notifications SET status='superseded',lease_until=NULL
    WHERE request_id=$1 AND decision<>$2 AND status IN ('pending','failed')`, [application.id, application.status]);
  await client.query(`INSERT INTO platform_access_notifications(request_id,decision,payload) VALUES($1,$2,$3)
    ON CONFLICT(request_id,decision) DO NOTHING`, [application.id, application.status, JSON.stringify(payload)]);
}

function testAddress(email) {
  const domain=String(email).split('@')[1]?.toLowerCase();
  return !domain || /(^|\.)(test|invalid|localhost|example\.com|example\.net|example\.org)$/.test(domain);
}

export async function sendBrevo(payload, env, fetcher=fetch, sandbox=false, idempotencyKey) {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) throw Object.assign(new Error('Brevo is not configured'), {notificationCode:'configuration'});
  const message=notificationMessage(payload,env);
  message.headers={...(idempotencyKey?{IdempotencyKey:idempotencyKey}:{}),...(sandbox?{'X-Sib-Sandbox':'drop'}:{})};
  const response=await fetcher('https://api.brevo.com/v3/smtp/email', {
    method:'POST', headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',accept:'application/json'},
    body:JSON.stringify(message),signal:AbortSignal.timeout(8000),
  });
  let data={};try {data=await response.json();} catch {}
  // Never retain the full provider response: it can contain recipient information and request details.
  if(!response.ok) throw Object.assign(new Error('Brevo rejected notification'), {notificationCode:`brevo_${response.status}`});
  if(!data.messageId) throw Object.assign(new Error('Missing Brevo receipt'), {notificationCode:'brevo_receipt'});
  return data.messageId;
}

export async function dispatchNotifications(registry, {requestId=null,limit=5,fetcher=fetch}={}) {
  if(registry.env.ACCESS_NOTIFICATIONS_ENABLED!=='true')return;
  for(let index=0;index<limit;index++) {
    const claimed=await registry.control.query(`UPDATE platform_access_notifications SET status='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes'
      WHERE id=(SELECT n.id FROM platform_access_notifications n JOIN platform_access_requests r ON r.id=n.request_id
        WHERE r.deleted_at IS NULL AND r.status=n.decision AND ($1::uuid IS NULL OR n.request_id=$1)
          AND n.attempts<5 AND ((n.status IN ('pending','failed') AND n.next_attempt_at<=now()) OR (n.status='sending' AND n.lease_until<now()))
        ORDER BY n.created_at FOR UPDATE OF n SKIP LOCKED LIMIT 1) RETURNING *`,[requestId]);
    const notification=claimed.rows[0];if(!notification)return;
    if(testAddress(notification.payload.email)) {
      await registry.control.query("UPDATE platform_access_notifications SET status='skipped',error_code='test_address',lease_until=NULL WHERE id=$1",[notification.id]);continue;
    }
    try {
      const messageId=await sendBrevo(notification.payload,registry.env,fetcher,false,`access-${notification.id}`);
      await registry.control.query("UPDATE platform_access_notifications SET status='sent',message_id=$2,sent_at=now(),error_code=NULL,lease_until=NULL WHERE id=$1",[notification.id,messageId]);
    } catch(error) {
      const code=error.notificationCode || 'network';
      await registry.control.query("UPDATE platform_access_notifications SET status='failed',error_code=$2,next_attempt_at=now()+interval '5 minutes',lease_until=NULL WHERE id=$1",[notification.id,code]);
    }
  }
}

export async function retryNotification(registry,id) {
  const result=await registry.control.query(`UPDATE platform_access_notifications n SET status='pending',attempts=0,error_code=NULL,next_attempt_at=now()
    FROM platform_access_requests r WHERE n.request_id=r.id AND r.id=$1 AND r.deleted_at IS NULL AND n.decision=r.status
      AND n.status='failed' RETURNING n.id`,[id]);
  if(!result.rowCount)throw Object.assign(new Error('No failed notification to retry'),{status:409});
  await dispatchNotifications(registry,{requestId:id,limit:1});
  return {retried:true};
}
