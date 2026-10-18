import { createHmac, timingSafeEqual } from 'crypto';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  company_id: string;
  role: string;
  exp: number;
};

export function signToken(payload: AuthTokenPayload, secret: string) {
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token: string, secret: string): AuthTokenPayload | null {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expected = sign(encodedPayload, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AuthTokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}
