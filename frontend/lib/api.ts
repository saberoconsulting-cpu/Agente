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

export function apiBase() {
  if (typeof window === 'undefined') return process.env.NEXT_PUBLIC_API_BASE || '';
  return process.env.NEXT_PUBLIC_API_BASE || `${window.location.origin}/api/v1`;
}

export function getToken() {
  return null;
}

export function setToken(token: string) {
  void token;
}

export function clearToken() {
  // Authentication is held in HttpOnly cookies and can only be cleared by /auth/logout.
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = typeof document === 'undefined' ? null : document.cookie.split('; ').find((item) => item.startsWith('sabero_csrf='))?.split('=')[1];
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase()) && csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(options.headers || {}),
    },
    credentials: 'same-origin',
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
  return payload as LoginResponse;
}
