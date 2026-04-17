import { apiFetch } from './client';
import type { User } from '../types';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<{ user: User }> {
  return apiFetch('/api/v1/auth/me');
}
