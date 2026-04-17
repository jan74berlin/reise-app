import { apiFetch } from './client';
import type { Trip } from '../types';

export async function getTrips(): Promise<{ trips: Trip[] }> {
  return apiFetch('/api/v1/trips');
}

export async function createTrip(data: { title: string; start_date?: string; end_date?: string }): Promise<{ trip: Trip }> {
  return apiFetch('/api/v1/trips', { method: 'POST', body: JSON.stringify(data) });
}
