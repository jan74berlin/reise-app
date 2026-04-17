// mobile/app/(app)/trips/[id]/index.tsx
import { View, FlatList, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNights } from '@/hooks/useNights';
import { NightCard } from '@/components/NightCard';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: nights, isLoading, isError } = useNights(id);

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" testID="loading-indicator" /></View>;
  if (isError) return <View style={s.center}><Text style={s.errorText}>Etappen konnten nicht geladen werden.</Text></View>;

  return (
    <View style={s.container}>
      <View style={s.actions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/journal`)}>
          <Text style={s.actionText}>📓 Tagebuch</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/checklist`)}>
          <Text style={s.actionText}>✅ Checkliste</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={nights}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NightCard
            night={item}
            onPress={() => router.push(`/(app)/trips/${id}/nights/${item.night_number}`)}
          />
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Keine Etappen.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  errorText: { color: '#dc2626', textAlign: 'center', paddingHorizontal: 24 },
  actions: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  actionBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '600' },
});
