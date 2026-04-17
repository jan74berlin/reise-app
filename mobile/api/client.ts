// mobile/api/client.ts
import { API_BASE } from '@/constants/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions {
  token?: string | null;
  method?: string;
  body?: unknown;
  isMultipart?: boolean;
  formData?: FormData;
}

export async function apiFetch<T = unknown>(
  path: string,
  { token, method = 'GET', body, isMultipart, formData }: FetchOptions
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isMultipart) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isMultipart ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}
