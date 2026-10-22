import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function tenantId(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,47}$/.test(value)) throw new Error('Invalid company ID');
  return value;
}

export function products(value) {
  if (!Array.isArray(value) || !value.length || value.some(p => !['agent', 'crm'].includes(p))) throw new Error('Products must contain agent and/or crm');
  return [...new Set(value)];
}

export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const serviceToken = () => randomBytes(32).toString('hex');

export function encrypt(value, secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw new Error('PLATFORM_ENCRYPTION_KEY must be 32 bytes in hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(v => v.toString('base64')).join('.');
}

export function decrypt(value, secret) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}

// Require international numbers; do not infer a country or merge ambiguous local numbers.
export function phone(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[\s()+.-]/g, '');
  if (!/^[1-9][0-9]{7,14}$/.test(normalized)) throw new Error('Phone must include country code');
  return normalized;
}

export function pageLimit(value, max = 300) {
  const number = Number(value ?? 100);
  if (!Number.isInteger(number) || number < 1) throw new Error('Invalid limit');
  return Math.min(number, max);
}

export function messageInput(body) {
  const required = ['id', 'conversationId', 'direction', 'messageType'];
  if (required.some(key => typeof body[key] !== 'string' || !body[key] || body[key].length > 200)) throw new Error('Invalid message');
  if (!['inbound', 'outbound'].includes(body.direction)) throw new Error('Invalid direction');
  if (body.providerMessageId != null && (typeof body.providerMessageId !== 'string' || body.providerMessageId.length > 300)) throw new Error('Invalid provider message ID');
  if (body.textBody != null && (typeof body.textBody !== 'string' || body.textBody.length > 100000)) throw new Error('Invalid text');
  const createdAt = body.createdAt ? new Date(body.createdAt) : new Date();
  if (!Number.isFinite(createdAt.getTime())) throw new Error('Invalid message date');
  return { id: body.id, conversationId: body.conversationId, providerMessageId: body.providerMessageId || undefined,
    direction: body.direction, messageType: body.messageType, textBody: body.textBody ?? null,
    rawPayload: body.rawPayload ?? null, inboundEventId: body.inboundEventId ?? null, createdAt };
}
