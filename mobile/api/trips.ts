// mobile/api/trips.ts
import { apiFetch } from './client';

export interface Trip {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  vehicle_height: string | null;
  vehicle_length: string | null;
  vehicle_weight: number | null;
  vehicle_fuel: string | null;
  created_at: string;
}

export function getTrips(token: string) {
  return apiFetch<{ trips: Trip[] }>('/api/v1/trips', { token });
}

export function getTrip(token: string, id: string) {
  return apiFetch<{ trip: Trip }>(`/api/v1/trips/${id}`, { token });
}

export function createTrip(token: string, body: Partial<Trip> & { title: string }) {
  return apiFetch<{ trip: Trip }>('/api/v1/trips', { token, method: 'POST', body });
}
