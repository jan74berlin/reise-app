// mobile/app/(app)/index.tsx
import { View, FlatList, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTrips } from '@/hooks/useTrips';
import { TripCard } from '@/components/TripCard';

export default function TripsScreen() {
  const router = useRouter();
  const { data: trips, isLoading, isError, refetch, isRefetching } = useTrips();

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator testID="loading-indicator" size="large" /></View>;
  }

  if (isError) {
    return (
      <View style={s.center}>
        <Text style={s.errorText} testID="error-message">Reisen konnten nicht geladen werden.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() => router.push(`/(app)/trips/${item.id}`)}
          />
        )}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={s.empty}>Keine Reisen vorhanden.</Text>}
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
});
