// mobile/api/checklist.ts
import { apiFetch } from './client';

export interface ChecklistItem {
  id: string;
  trip_id: string;
  category: string | null;
  text: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export function getChecklist(token: string, tripId: string) {
  return apiFetch<{ items: ChecklistItem[] }>(`/api/v1/trips/${tripId}/checklist`, { token });
}

export function addItem(token: string, tripId: string, text: string, category?: string) {
  return apiFetch<{ item: ChecklistItem }>(`/api/v1/trips/${tripId}/checklist`, {
    token, method: 'POST', body: { text, category },
  });
}

export function toggleItem(token: string, tripId: string, itemId: string, is_checked: boolean) {
  return apiFetch<{ item: ChecklistItem }>(`/api/v1/trips/${tripId}/checklist/${itemId}`, {
    token, method: 'PUT', body: { is_checked },
  });
}

export function deleteItem(token: string, tripId: string, itemId: string) {
  return apiFetch(`/api/v1/trips/${tripId}/checklist/${itemId}`, { token, method: 'DELETE' });
}
