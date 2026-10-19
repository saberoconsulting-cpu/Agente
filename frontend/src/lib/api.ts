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

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const csrf = getToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(method !== 'GET' && csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.message || response.statusText);
  return payload as T;
}

export async function login(email: string, password: string) {
  const response = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || 'No se pudo iniciar sesion');
  return payload as LoginResponse;
}
