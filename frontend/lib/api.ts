export type SessionUser = {
  id: string;
  company_id: string;
  email: string;
  role: string;
  active?: boolean;
};

export type LoginResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: SessionUser;
};

const TOKEN_KEY = 'sabero_agent_auth_token';

export function apiBase() {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_API_BASE || '';
  return process.env.NEXT_PUBLIC_API_BASE || `${window.location.origin}/api/v1`;
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
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
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || 'No se pudo iniciar sesion');
  setToken(payload.access_token);
  return payload as LoginResponse;
}
