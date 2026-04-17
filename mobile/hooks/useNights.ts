// mobile/hooks/useNights.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getNights } from '@/api/nights';

export function useNights(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['nights', tripId],
    queryFn: () => getNights(token!, tripId),
    enabled: !!token && !!tripId,
    select: (data) => data.nights,
  });
}
