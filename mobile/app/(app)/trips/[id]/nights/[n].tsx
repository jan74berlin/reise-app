// mobile/app/(app)/trips/[id]/nights/[n].tsx
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNights } from '@/hooks/useNights';
import { SpotCard } from '@/components/SpotCard';
import { useAuthStore } from '@/stores/authStore';
import { selectSpot } from '@/api/nights';

export default function NightDetailScreen() {
  const { id: tripId, n } = useLocalSearchParams<{ id: string; n: string }>();
  const { data: nights, isLoading } = useNights(tripId);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const night = nights?.find((nt) => String(nt.night_number) === n);

  const selectMut = useMutation({
    mutationFn: ({ nightSpotId }: { nightSpotId: string }) =>
      selectSpot(token!, tripId, parseInt(n, 10), nightSpotId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nights', tripId] }),
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" testID="loading-indicator" /></View>;
  if (!night) return <View style={s.center}><Text>Nacht nicht gefunden</Text></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.heading}>Nacht {night.night_number}</Text>
      {night.date ? <Text style={s.date}>{night.date}</Text> : null}

      {night.notes ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notizen</Text>
          <Text style={s.notes}>{night.notes}</Text>
        </View>
      ) : null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Stellplätze</Text>
        {night.spots.length === 0 ? (
          <Text style={s.empty}>Keine Stellplätze</Text>
        ) : (
          night.spots.map((spot) => (
            <SpotCard
              key={spot.night_spot_id}
              spot={spot}
              onSelect={() => selectMut.mutate({ nightSpotId: spot.night_spot_id })}
            />
          ))
        )}
      </View>

      {night.sights.length > 0 ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Sehenswürdigkeiten</Text>
          {night.sights.map((sight) => (
            <View key={sight.id} style={s.sightCard} testID={`sight-${sight.id}`}>
              <Text style={s.sightName}>{sight.name}</Text>
              {sight.description ? <Text style={s.sightDesc}>{sight.description}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  date: { color: '#6b7280', marginBottom: 12 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 4 },
  notes: { fontSize: 14, color: '#374151', lineHeight: 20 },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
  sightCard: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  sightName: { fontSize: 15, fontWeight: '600' },
  sightDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
