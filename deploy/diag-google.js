// Diagnóstico de solo lectura: dónde está guardada la conexión de Google. No imprime tokens ni claves.
// The script is copied to /tmp; resolve dependencies from the backend app.
const { createRequire } = require('node:module');
const appRequire = createRequire('/app/package.json');
const { Pool } = appRequire('pg');
const axios = appRequire('axios');
const TENANT = process.argv[2] || 'saberoconsulting';
const q = 'select company_id, connected_at, revoked_at, scopes from google_oauth_connections';
const qs = 'select company_id, used_at, expires_at from google_oauth_states order by expires_at desc limit 5';
async function checkCalendar(pool) {
  try {
    const { ConfigService } = appRequire('@nestjs/config');
    const { OAuthTokenCryptoService } = appRequire('/app/dist/src/modules/security/oauth-token-crypto.service.js');
    const { GoogleOAuthTokenService } = appRequire('/app/dist/src/modules/integrations/google/google-oauth-token.service.js');
    const { GoogleCalendarService } = appRequire('/app/dist/src/modules/integrations/google/google-calendar.service.js');
    const config = new ConfigService(process.env);
    const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_CALENDAR_ID', 'OAUTH_TOKEN_ENCRYPTION_KEY'].filter(key => !process.env[key]);
    if (missing.length) { console.log('CALENDAR missing configuration', JSON.stringify(missing)); return; }
    const repository = {
      findActiveTokens: companyId => pool.query('select encrypted_tokens from google_oauth_connections where company_id=$1 and revoked_at is null', [companyId]),
      // Read-only diagnostic: refreshed credentials stay in memory.
      updateTokens: async () => undefined,
    };
    const tokens = new GoogleOAuthTokenService(config, repository, new OAuthTokenCryptoService(config));
    const calendar = new GoogleCalendarService(tokens, config, {}, {});
    const now = new Date();
    const availability = await calendar.getAvailability({ companyId: TENANT, timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 7 * 86400000).toISOString() });
    console.log('CALENDAR real Google query OK', JSON.stringify({ company_id: TENANT, busy_intervals: availability.busy.length, event_created: false }));
  } catch (error) {
    const provider = error.response?.data?.error;
    const code = typeof provider === 'string' ? provider : provider?.status;
    console.log('CALENDAR real Google query FAILED', JSON.stringify({ http_status: error.response?.status || null, code: code || error.code || error.constructor?.name || 'unknown' }));
    process.exitCode = 1;
  }
}
async function run(label, pool, verifyCalendar = false) {
  try { console.log(label, 'connections', JSON.stringify((await pool.query(q)).rows)); } catch (e) { console.log(label, 'connections ERROR', e.message); }
  try { console.log(label, 'states', JSON.stringify((await pool.query(qs)).rows)); } catch (e) { console.log(label, 'states ERROR', e.message); }
  if (verifyCalendar) await checkCalendar(pool);
  await pool.end();
}
(async () => {
  await run('DEFAULT', new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, options: '-c search_path=agent,public' }));
  try {
    const base = (process.env.PLATFORM_API_URL || '').replace(/\/$/, '');
    const { data } = await axios.get(`${base}/v1/admin/tenants/${TENANT}/connection`, { headers: { Authorization: `Bearer ${process.env.PLATFORM_ADMIN_TOKEN}`, 'X-Admin-Token': process.env.PLATFORM_ADMIN_TOKEN }, timeout: 10000 });
    if (!data?.database_url) throw new Error('La plataforma no devolvio database_url');
    // Match TenantService: internal tenant databases do not force SSL.
    // Explicit SSL settings in database_url are still respected by pg.
    await run('TENANT ' + TENANT, new Pool({ connectionString: data.database_url, connectionTimeoutMillis: 10000, options: '-c search_path=agent,public' }), true);
  } catch (e) { console.log('TENANT lookup ERROR', e.message); }
})();
