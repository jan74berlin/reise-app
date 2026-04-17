// mobile/api/auth.ts
import { apiFetch } from './client';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'member';
}

export interface Family {
  id: string;
  name: string;
  invite_code: string;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function register(
  email: string,
  password: string,
  display_name: string,
  family_name: string
) {
  return apiFetch<{ token: string; user: User; family: Family }>(
    '/api/v1/auth/register',
    { method: 'POST', body: { email, password, display_name, family_name } }
  );
}

export async function join(
  invite_code: string,
  email: string,
  password: string,
  display_name: string
) {
  return apiFetch<{ token: string; user: User }>('/api/v1/auth/join', {
    method: 'POST',
    body: { invite_code, email, password, display_name },
  });
}

export async function getMe(token: string) {
  return apiFetch<{ user: User }>('/api/v1/auth/me', { token });
}
