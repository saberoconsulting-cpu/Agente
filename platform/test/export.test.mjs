import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportConfig } from '../src/admin.mjs';
import { encrypt } from '../src/domain.mjs';

test('deployment export preserves agent secrets when CRM is added', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'sabero-platform-'));
  const key = 'a'.repeat(64);
  let enabled = ['agent'];
  const registry = { env: { PLATFORM_ENCRYPTION_KEY: key }, control: { query: async sql => ({ rows: sql.startsWith('SELECT') ? enabled.map(product => ({ product })) : [] }) } };
  const company = { id: 'empresa-test', name: 'Empresa Test', encrypted_connection: encrypt('postgresql://tenant:secret@localhost:5432/tenant_test', key) };
  const target = join(folder, company.id);
  try {
    await exportConfig(registry, company, folder);
    const original = await readFile(join(target, 'agent.env'), 'utf8');
    enabled = ['agent', 'crm'];
    await exportConfig(registry, company, folder);
    assert.equal(await readFile(join(target, 'agent.env'), 'utf8'), original);
    const compose = JSON.parse(await readFile(join(target, 'compose.json'), 'utf8'));
    assert.equal(compose.services['empresa-test-crm'].build.context, '../../../../crm_inmobiliario/backend');
    assert.equal(compose.services['empresa-test-agent-worker'].command[2], 'start:worker');
    assert.equal(Object.values(compose.services).some(service => service.ports), false);
    assert.equal((await readFile(join(target, 'crm.env'), 'utf8')).includes('schema=agent'), false);
  } finally {
    // Remove only the exact files created in this dedicated temporary directory.
    for (const name of ['agent.env', 'crm.env', 'compose.json', 'nginx.conf']) await unlink(join(target, name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(target); await rmdir(folder);
  }
});
