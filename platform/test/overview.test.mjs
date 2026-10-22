import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuthorized, companyOverview } from '../src/overview.mjs';

test('global administration requires its own strong credential', () => {
  assert.equal(adminAuthorized(undefined, undefined), false);
  assert.equal(adminAuthorized('short', 'short'), false);
  assert.equal(adminAuthorized('a'.repeat(64), 'b'.repeat(64)), false);
  assert.equal(adminAuthorized('a'.repeat(64), 'a'.repeat(64)), true);
});
test('overview never returns stored connection credentials', async () => {
  const result = await companyOverview({ control: { query: async () => ({ rows: [{ id: 'test', name: 'Test', sector: 'services', status: 'suspended', products: [], encrypted_connection: 'private', mongo_database: 'private' }] }) } });
  assert.equal(result.items[0].metrics, null);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
