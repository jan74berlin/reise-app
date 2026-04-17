// mobile/hooks/useJournal.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getJournal } from '@/api/journal';

export function useJournal(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['journal', tripId],
    queryFn: () => getJournal(token!, tripId),
    enabled: !!token && !!tripId,
    select: (d) => d.entries,
  });
}
