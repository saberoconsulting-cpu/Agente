import test from 'node:test';
import assert from 'node:assert/strict';
import { attachReceipts, saveReceipt } from '../src/messages.mjs';

test('read receipts survive out-of-order delivery events and only annotate matching outbound messages', async () => {
  const rows = [];
  const collection = {
    async updateOne(filter, update) {
      if (!rows.some(row => row._id === filter._id)) rows.push({ _id: filter._id, ...update.$setOnInsert, occurredAt: update.$min.occurredAt });
    },
    find(filter) { return { toArray: async () => rows.filter(row => filter.providerMessageId.$in.includes(row.providerMessageId)) }; },
  };
  const db = { collection: () => collection };
  for (const status of ['read', 'sent', 'failed', 'delivered', 'read']) {
    await saveReceipt(db, { providerMessageId: 'wamid.1', status, occurredAt: '2026-11-14T10:00:00Z' });
  }
  const result = await attachReceipts(db, [
    { direction: 'outbound', providerMessageId: 'wamid.1' },
    { direction: 'outbound', providerMessageId: 'other' },
    { direction: 'inbound', providerMessageId: 'wamid.1' },
  ]);
  assert.equal(result[0].deliveryStatus, 'read');
  assert.equal(result[1].deliveryStatus, undefined);
  assert.equal(result[2].deliveryStatus, undefined);
  assert.equal(rows.length, 4);
});

test('rejects malformed receipts', async () => {
  await assert.rejects(saveReceipt({}, { providerMessageId: 'x', status: 'fake', occurredAt: 'invalid' }), /Invalid receipt/);
});
