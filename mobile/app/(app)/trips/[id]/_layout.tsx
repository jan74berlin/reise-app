// mobile/app/(app)/trips/[id]/_layout.tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTrip } from '@/hooks/useTrips';

export default function TripLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trip } = useTrip(id);
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: trip?.title ?? 'Reise' }} />
      <Stack.Screen name="checklist" options={{ title: 'Checkliste' }} />
      <Stack.Screen name="journal" options={{ title: 'Tagebuch' }} />
      <Stack.Screen name="nights/[n]" options={{ title: 'Nacht' }} />
    </Stack>
  );
}
