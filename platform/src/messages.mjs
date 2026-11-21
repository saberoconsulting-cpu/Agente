import { messageInput, pageLimit } from './domain.mjs';

export async function initializeMessages(db) {
  await db.collection('message_receipts').createIndex({ providerMessageId: 1 });
  await db.collection('messages').createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { providerMessageId: 1 }, unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
    { key: { conversationId: 1, createdAt: -1, id: -1 } },
    { key: { direction: 1, conversationId: 1, createdAt: -1 } },
  ]);
}

export async function saveReceipt(db, body) {
  const { providerMessageId, status, occurredAt } = body;
  if (typeof providerMessageId !== 'string' || !providerMessageId || providerMessageId.length > 500 ||
    !['sent','delivered','read','failed'].includes(status) || !Number.isFinite(Date.parse(occurredAt))) {
    throw Object.assign(new Error('Invalid receipt'), { status: 400 });
  }
  await db.collection('message_receipts').updateOne({ _id: `${providerMessageId}:${status}` }, {
    $setOnInsert: { providerMessageId, status }, $min: { occurredAt: new Date(occurredAt) },
  }, { upsert: true });
  return { recorded: true };
}

export async function attachReceipts(db, items) {
  const ids = items.filter(row => row.direction === 'outbound' && row.providerMessageId).map(row => row.providerMessageId);
  if (!ids.length) return items;
  const receipts = await db.collection('message_receipts').find({ providerMessageId: { $in: ids } }).toArray();
  const rank = { sent: 1, failed: 2, delivered: 3, read: 4 };
  const latest = new Map();
  for (const receipt of receipts) {
    if ((rank[receipt.status] || 0) > (rank[latest.get(receipt.providerMessageId)?.status] || 0)) latest.set(receipt.providerMessageId, receipt);
  }
  return items.map(item => {
    const receipt = item.direction === 'outbound' && latest.get(item.providerMessageId);
    return receipt ? { ...item, deliveryStatus: receipt.status, deliveryStatusAt: receipt.occurredAt } : item;
  });
}

export async function saveMessage(db, body) {
  const value = messageInput(body);
  if (!value.providerMessageId) delete value.providerMessageId;
  try {
    await db.collection('messages').insertOne(value);
    return { inserted: true, id: value.id };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const existing = await db.collection('messages').findOne(value.providerMessageId ? { providerMessageId: value.providerMessageId } : { id: value.id });
    if (!existing || existing.conversationId !== value.conversationId || existing.direction !== value.direction) throw Object.assign(new Error('Conflicting message identity'), { status: 409 });
    return { inserted: false, id: existing.id };
  }
}

export async function listMessages(db, query, conversationIds) {
  if (!query.conversationId && !conversationIds) throw new Error('conversationId is required');
  const filter = { conversationId: conversationIds ? { $in: conversationIds } : query.conversationId };
  if (query.cursor) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()); } catch { throw new Error('Invalid cursor'); }
    const date = new Date(cursor.createdAt);
    if (!Number.isFinite(date.getTime()) || typeof cursor.id !== 'string') throw new Error('Invalid cursor');
    filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, id: { $lt: cursor.id } }];
  }
  const limit = pageLimit(query.limit);
  const rows = await db.collection('messages').find(filter, { projection: { _id: 0 } })
    .sort({ createdAt: -1, id: -1 }).limit(limit + 1).toArray();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items: await attachReceipts(db, items.reverse().map(presentMessage)), nextCursor: hasMore ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null };
}

export function presentMessage(row){
  const {rawPayload,...safe}=row;
  if(!safe.presentation){
    safe.presentation={sender:row.direction==='inbound'?'contact':'ai'};
    const original=rawPayload?.provider||rawPayload;
    for(const kind of ['document','image','audio','video'])if(original?.[kind]?.id){
      safe.presentation.attachment={id:original[kind].id,kind,filename:original[kind].filename,mime_type:original[kind].mime_type};break;
    }
  }
  return safe;
}
