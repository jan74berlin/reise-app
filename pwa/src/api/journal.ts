import { apiFetch } from './client';
import type { JournalEntry, Block } from '../types';

export async function getEntries(tripId: string): Promise<{ entries: JournalEntry[] }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal`);
}

export async function createEntry(
  tripId: string,
  data: { text?: string; blocks?: Block[] }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  data: { text?: string; blocks?: Block[] }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(tripId: string, entryId: string): Promise<void> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}`, { method: 'DELETE' });
}

export async function uploadMedia(
  tripId: string,
  entryId: string,
  file: File
): Promise<{ media: { id: string; url: string } }> {
  const form = new FormData();
  form.append('photo', file);
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/media`, {
    method: 'POST',
    body: form,
  });
}

export async function deleteMedia(tripId: string, entryId: string, mediaId: string): Promise<void> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/media/${mediaId}`, { method: 'DELETE' });
}
