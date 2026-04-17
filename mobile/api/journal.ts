// mobile/api/journal.ts
import { apiFetch } from './client';

export interface MediaItem {
  id: string;
  drive_file_id: string;
  drive_view_url: string;
  filename: string;
  caption: string | null;
  taken_at: string | null;
}

export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id: string | null;
  user_id: string | null;
  text: string | null;
  created_at: string;
  updated_at: string;
  media: MediaItem[];
}

export function getJournal(token: string, tripId: string) {
  return apiFetch<{ entries: JournalEntry[] }>(`/api/v1/trips/${tripId}/journal`, { token });
}

export function createEntry(token: string, tripId: string, text: string, night_id?: string) {
  return apiFetch<{ entry: JournalEntry }>(`/api/v1/trips/${tripId}/journal`, {
    token, method: 'POST', body: { text, night_id },
  });
}

export function uploadPhoto(token: string, tripId: string, entryId: string, uri: string, mimeType: string) {
  const fd = new FormData();
  fd.append('photo', { uri, name: 'photo.jpg', type: mimeType } as any);
  return apiFetch<{ media: MediaItem }>(`/api/v1/trips/${tripId}/journal/${entryId}/media`, {
    token, method: 'POST', isMultipart: true, formData: fd,
  });
}
