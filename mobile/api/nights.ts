// mobile/api/nights.ts
import { apiFetch } from './client';

export interface Spot {
  night_spot_id: string;
  role: 'primary' | 'alt1' | 'alt2' | 'altpick';
  is_selected: boolean;
  notes: string | null;
  pn_id: number | null;
  lat: string;
  lng: string;
  title: string | null;
  type_code: string | null;
  rating: string | null;
  reviews: number | null;
}

export interface Sight {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
}

export interface Night {
  id: string;
  night_number: number;
  date: string | null;
  lat_center: string | null;
  lng_center: string | null;
  notes: string | null;
  spots: Spot[];
  sights: Sight[];
}

export function getNights(token: string, tripId: string) {
  return apiFetch<{ nights: Night[] }>(`/api/v1/trips/${tripId}/nights`, { token });
}

export function selectSpot(token: string, tripId: string, nightNumber: number, nightSpotId: string, is_selected: boolean) {
  return apiFetch(`/api/v1/trips/${tripId}/nights/${nightNumber}/spots/${nightSpotId}`, {
    token, method: 'PUT', body: { is_selected },
  });
}
