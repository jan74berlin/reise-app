// mobile/api/pn.ts
import { apiFetch } from './client';

export interface PnSpot {
  id: number;
  lat: number;
  lng: number;
  title_short: string;
  type: { code: string };
  rating: number;
  review: number;
}

export function searchPn(token: string, lat: number, lng: number, radius = 25) {
  const filter = JSON.stringify({
    type: ['PN', 'APN', 'ACC_G'],
    services: [], activities: [],
    maxHeight: '0', all_year: '0',
    booking_filter: '0', custom_type: [],
  });
  return apiFetch<{ spots: PnSpot[] }>(
    `/api/v1/pn/around?lat=${lat}&lng=${lng}&radius=${radius}&filter=${encodeURIComponent(filter)}`,
    { token }
  );
}
