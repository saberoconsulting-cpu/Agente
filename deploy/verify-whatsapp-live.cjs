// Real acceptance test. No simulated Meta responses and no messages sent by this script.
// Credentials are supplied by verify-whatsapp-live.ps1 and never written to disk.
const { randomBytes } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const base = 'https://agente.saberoconsulting.com/api/v1';
const sessions = [];
const evidence = { date: new Date().toISOString(), status: 'incomplete', checks: [] };
function check(ok, name) {
  evidence.checks.push({ name, passed: Boolean(ok) });
  if (!ok) throw new Error(`Check failed: ${name}`);
}
async function request(session, path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', Cookie: session.cookies, 'x-csrf-token': session.csrf, ...options.headers,
  } });
  const data = await response.json().catch(() => null);
  return { response, data };
}
async function login(label) {
  const email = process.env[`SABERO_TEST_${label}_EMAIL`];
  const password = process.env[`SABERO_TEST_${label}_PASSWORD`];
  if (!email || !password) throw new Error(`Missing credentials for company ${label}`);
  const response = await fetch(base + '/auth/login', { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!response.ok) throw new Error(`Company ${label}: login HTTP ${response.status}`);
  const { user } = await response.json();
  const cookies = response.headers.getSetCookie().map(cookie => cookie.split(';')[0]);
  const csrf = decodeURIComponent(cookies.find(cookie => cookie.startsWith('sabero_csrf='))?.slice('sabero_csrf='.length) || '');
  const session = { user, csrf, cookies: cookies.join('; '), label, marker: `SABERO-PRUEBA-${label}-${randomBytes(4).toString('hex')}` };
  sessions.push(session);
  check(user.role === 'owner', `company ${label}: owner access`);
  const config = await request(session, '/whatsapp/connections/embedded-signup/config');
  check(config.response.ok && config.data?.enabled && config.data.config_id === '1813565349855807', `company ${label}: production config`);
  const connections = await request(session, '/whatsapp/connections');
  check(connections.response.ok && Array.isArray(connections.data), `company ${label}: connection list`);
  session.connection = connections.data.find(connection => connection.status === 'connected');
  check(session.connection?.company_id === user.company_id, `company ${label}: active company-owned number`);
  return session;
}
async function messages(session) {
  const conversations = await request(session, '/conversations?limit=20');
  if (!conversations.response.ok || !Array.isArray(conversations.data)) throw new Error('Could not read conversations');
  const result = [];
  for (const conversation of conversations.data) {
    const page = await request(session, `/conversations/${encodeURIComponent(conversation.id)}/messages?limit=100`);
    if (page.response.ok && Array.isArray(page.data)) result.push(...page.data);
  }
  return result;
}
(async () => {
  try {
    const a = await login('A');
    const b = await login('B');
    check(a.user.company_id !== b.user.company_id, 'two distinct companies');
    check(a.connection.phone_number_id !== b.connection.phone_number_id, 'two distinct business phone numbers');
    evidence.companies = [a.user.company_id, b.user.company_id];
    for (const [own, other] of [[a, b], [b, a]]) {
      // A foreign ID must be rejected before any Meta request or registration.
      const foreign = await request(own, `/whatsapp/connections/${encodeURIComponent(other.connection.id)}/register`, { method: 'POST', body: '{}' });
      check(foreign.response.status === 404, `company ${own.label}: foreign registration forbidden`);
    }
    for (const session of [a, b]) console.log(`Desde un teléfono de prueba envía "${session.marker}" al WhatsApp vinculado de ${session.user.company_id}.`);
    console.log('Esperando recepción y respuesta automática real durante un máximo de 3 minutos...');
    const deadline = Date.now() + 180000;
    let passed = false;
    while (Date.now() < deadline) {
      const [ma, mb] = await Promise.all([messages(a), messages(b)]);
      check(!ma.some(message => message.text_body?.includes(b.marker)) && !mb.some(message => message.text_body?.includes(a.marker)), 'test messages do not cross companies');
      const completed = [[a, ma], [b, mb]].every(([session, rows]) => {
        const incoming = rows.find(message => message.direction === 'inbound' && message.text_body?.includes(session.marker));
        return incoming && rows.some(message => message.direction === 'outbound' && message.conversation_id === incoming.conversation_id
          && new Date(message.created_at).getTime() >= new Date(incoming.created_at).getTime()
          && ['sent', 'delivered', 'read'].includes(message.delivery_status));
      });
      if (completed) { passed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    check(passed, 'both companies: actual inbound and provider-confirmed outbound');
    evidence.status = 'passed';
    console.log('Prueba real aprobada para ambas empresas.');
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = error.message;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    for (const session of sessions) await request(session, '/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    writeFileSync(join(__dirname, 'whatsapp-live-result.json'), JSON.stringify(evidence, null, 2));
  }
})();
