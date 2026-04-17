// mobile/hooks/useChecklist.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getChecklist } from '@/api/checklist';

export function useChecklist(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['checklist', tripId],
    queryFn: () => getChecklist(token!, tripId),
    enabled: !!token && !!tripId,
    select: (d) => d.items,
  });
}
