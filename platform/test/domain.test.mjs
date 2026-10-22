import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantId, products, encrypt, decrypt, phone, pageLimit, messageInput } from '../src/domain.mjs';

test('company identifiers cannot become SQL or paths', () => {
  for (const id of ['../other', 'x;DROP DATABASE y', 'A', '', 'a_b']) assert.throws(() => tenantId(id));
  assert.equal(tenantId('empresa-juan'), 'empresa-juan');
});
test('only supported products are enabled', () => {
  assert.deepEqual(products(['agent', 'crm', 'agent']), ['agent', 'crm']);
  assert.throws(() => products(['admin']));
});
test('database secrets are authenticated and encrypted', () => {
  const key = 'a'.repeat(64);
  const encoded = encrypt('postgresql://user:secret@host/company', key);
  assert.equal(encoded.includes('secret'), false);
  assert.equal(decrypt(encoded, key), 'postgresql://user:secret@host/company');
  assert.throws(() => decrypt(encoded, 'b'.repeat(64)));
});
test('contact numbers are normalized without guessing countries', () => {
  assert.equal(phone('+51 999-123-456'), '51999123456');
  assert.throws(() => phone('123'));
});
test('invalid pagination and message bodies are rejected', () => {
  assert.equal(pageLimit(1000), 300);
  assert.throws(() => pageLimit('NaN'));
  assert.throws(() => messageInput({ id: 'a' }));
  assert.throws(() => messageInput({ id: 'a', conversationId: 'b', direction: 'inbound', messageType: 'text', createdAt: 'bad' }));
});
