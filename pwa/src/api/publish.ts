import { apiFetch } from './client';

export async function previewEntry(tripId: string, entryId: string): Promise<{ preview: Record<string, unknown> }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/preview`);
}

export async function publishEntry(tripId: string, entryId: string): Promise<{ is_published: true; publish_seq: number; first_published_at: string; url: string }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/publish`, { method: 'POST' });
}

export async function unpublishEntry(tripId: string, entryId: string): Promise<{ is_published: false }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/unpublish`, { method: 'POST' });
}

export async function publishAll(tripId: string): Promise<{ republished: number }> {
  return apiFetch(`/api/v1/trips/${tripId}/publish-all`, { method: 'POST' });
}
