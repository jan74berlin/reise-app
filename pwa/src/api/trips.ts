import { apiFetch } from './client';
import type { Trip } from '../types';

export async function getTrips(): Promise<{ trips: Trip[] }> {
  return apiFetch('/api/v1/trips');
}

export async function createTrip(data: {
  title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}): Promise<{ trip: Trip }> {
  return apiFetch('/api/v1/trips', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTrip(
  tripId: string,
  data: { title?: string; start_date?: string; end_date?: string; description?: string }
): Promise<{ trip: Trip }> {
  return apiFetch(`/api/v1/trips/${tripId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
