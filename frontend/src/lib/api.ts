export type SessionUser = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  active?: boolean;
};

export type LoginResponse = {
  expires_in: number;
  user: SessionUser;
};

const CSRF_COOKIE = 'sabero_csrf';

export function apiBase() {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_API_BASE || '';
  return process.env.NEXT_PUBLIC_API_BASE || `${window.location.origin}/api/v1`;
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

export function getToken() {
  return readCookie(CSRF_COOKIE);
}

export function setToken(_token: string) {
  // Auth se maneja con cookies HttpOnly; el CSRF token se lee de sabero_csrf.
}

export function clearToken() {
  // Llamar a /auth/logout para limpiar las cookies en el backend.
}

export const SESSION_EXPIRED_EVENT = 'sabero:session-expired';
export const SESSION_EXPIRED_MESSAGE = 'Tu sesión venció. Vuelve a iniciar sesión.';

/** Calls that must never trigger a renewal (they are the sign-in itself) or announce an expired session (probing). */
const NO_RENEW = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/password', '/platform/access-requests'];
const SILENT_PROBES = ['/auth/me'];

let renewing: Promise<boolean> | null = null;

/** Renews the access cookie with the long-lived refresh cookie. One renewal is shared by every request that fails together. */
function renewSession(): Promise<boolean> {
  if (!renewing) {
    renewing = (async () => {
      try {
        const response = await fetch(`${apiBase()}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) });
        return response.ok;
      } catch { return false; }
    })().finally(() => { setTimeout(() => { renewing = null; }, 0); });
  }
  return renewing;
}

/**
 * fetch for authenticated calls: attaches the CSRF header, and on a 401 renews the session once and retries.
 * If the session cannot be renewed it announces it, so the app can send the person back to sign in.
 */
export async function authFetch(url: string, init: RequestInit = {}, path = ''): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const send = () => {
    const headers = new Headers(init.headers || {});
    const csrf = getToken();
    if (method !== 'GET' && csrf) headers.set('X-CSRF-Token', csrf);
    return fetch(url, { ...init, headers, credentials: 'include' });
  };
  let response = await send();
  if (response.status !== 401 || NO_RENEW.some(item => path.startsWith(item))) return response;
  if (await renewSession()) {
    response = await send();
    if (response.status !== 401) return response;
  }
  if (typeof window !== 'undefined' && !SILENT_PROBES.some(item => path.startsWith(item))) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  return response;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await authFetch(`${apiBase()}${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(30000),
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    }, path);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('No pudimos conectar con SABERO. Revisa tu conexión e inténtalo de nuevo.');
  }
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {
    throw new Error('El servicio no está disponible en este momento. Inténtalo de nuevo en unos instantes.');
  }
  if (!response.ok) {
    if (response.status === 401 && !NO_RENEW.some(item => path.startsWith(item))) throw new Error(SESSION_EXPIRED_MESSAGE);
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join('. ') : message || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
  }
  return payload as T;
}

export async function login(email: string, password: string) {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
}
