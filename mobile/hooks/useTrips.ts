// mobile/hooks/useTrips.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getTrips, getTrip } from '@/api/trips';

export function useTrips() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['trips'],
    queryFn: () => getTrips(token!),
    enabled: !!token,
    select: (data) => data.trips,
  });
}

export function useTrip(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['trips', id],
    queryFn: () => getTrip(token!, id),
    enabled: !!token && !!id,
    select: (data) => data.trip,
  });
}
