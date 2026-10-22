import { messageInput, pageLimit } from './domain.mjs';

export async function initializeMessages(db) {
  await db.collection('messages').createIndexes([
    { key: { id: 1 }, unique: true },
    { key: { providerMessageId: 1 }, unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
    { key: { conversationId: 1, createdAt: -1, id: -1 } },
    { key: { direction: 1, conversationId: 1, createdAt: -1 } },
  ]);
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
  const rows = await db.collection('messages').find(filter, { projection: { _id: 0, rawPayload: 0 } })
    .sort({ createdAt: -1, id: -1 }).limit(limit + 1).toArray();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items: items.reverse(), nextCursor: hasMore ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url') : null };
}
