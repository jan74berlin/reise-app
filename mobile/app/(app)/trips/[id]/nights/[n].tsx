// mobile/app/(app)/trips/[id]/nights/[n].tsx
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNights } from '@/hooks/useNights';
import { SpotCard } from '@/components/SpotCard';
import { useAuthStore } from '@/stores/authStore';
import { selectSpot } from '@/api/nights';
import { PnSearchSheet } from '@/components/PnSearchSheet';
import { apiFetch } from '@/api/client';
import type { PnSpot } from '@/api/pn';

export default function NightDetailScreen() {
  const { id: tripId, n } = useLocalSearchParams<{ id: string; n: string }>();
  const { data: nights, isLoading } = useNights(tripId);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const [gpsPos, setGpsPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showPnSearch, setShowPnSearch] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGpsPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    })();
  }, []);

  const night = nights?.find((nt) => String(nt.night_number) === n);

  const selectMut = useMutation({
    mutationFn: ({ nightSpotId }: { nightSpotId: string }) =>
      selectSpot(token!, tripId, parseInt(n, 10), nightSpotId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nights', tripId] }),
  });

  const addSpotMut = useMutation({
    mutationFn: ({ spot, role }: { spot: PnSpot; role: string }) =>
      apiFetch(`/api/v1/trips/${tripId}/nights/${n}/spots`, {
        token: token!,
        method: 'POST',
        body: {
          pn_id: spot.id,
          lat: spot.lat,
          lng: spot.lng,
          title: spot.title_short,
          type_code: spot.type?.code,
          rating: spot.rating,
          reviews: spot.review,
          role,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nights', tripId] }),
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" testID="loading-indicator" /></View>;
  if (!night) return <View style={s.center}><Text>Nacht nicht gefunden</Text></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.heading}>Nacht {night.night_number}</Text>
      {night.date ? <Text style={s.date}>{night.date}</Text> : null}

      {(night.lat_center && night.lng_center) ? (
        <MapView
          style={s.miniMap}
          provider={PROVIDER_GOOGLE}
          testID="night-map"
          initialRegion={{
            latitude: parseFloat(night.lat_center),
            longitude: parseFloat(night.lng_center),
            latitudeDelta: 0.15,
            longitudeDelta: 0.15,
          }}
        >
          {night.spots.map((spot) => (
            <Marker
              key={spot.night_spot_id}
              coordinate={{ latitude: parseFloat(spot.lat), longitude: parseFloat(spot.lng) }}
              title={spot.title ?? undefined}
              pinColor={spot.is_selected ? '#2563eb' : '#ef4444'}
            />
          ))}
          {gpsPos && (
            <Circle
              center={gpsPos}
              radius={50}
              fillColor="rgba(37,99,235,0.2)"
              strokeColor="#2563eb"
            />
          )}
        </MapView>
      ) : null}

      {night.notes ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notizen</Text>
          <Text style={s.notes}>{night.notes}</Text>
        </View>
      ) : null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Stellplätze</Text>
        <TouchableOpacity
          style={s.searchBtn}
          onPress={() => setShowPnSearch(true)}
          testID="pn-search-btn"
        >
          <Text style={s.searchBtnText}>+ Stellplatz suchen (park4night)</Text>
        </TouchableOpacity>
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
      {night.lat_center && night.lng_center && (
        <PnSearchSheet
          visible={showPnSearch}
          lat={parseFloat(night.lat_center)}
          lng={parseFloat(night.lng_center)}
          onClose={() => setShowPnSearch(false)}
          onSelect={(spot, role) => {
            addSpotMut.mutate({ spot, role });
            setShowPnSearch(false);
          }}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  date: { color: '#6b7280', marginBottom: 12 },
  miniMap: { height: 180, borderRadius: 10, marginBottom: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 4 },
  notes: { fontSize: 14, color: '#374151', lineHeight: 20 },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
  sightCard: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  sightName: { fontSize: 15, fontWeight: '600' },
  sightDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  searchBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 },
  searchBtnText: { color: '#16a34a', fontWeight: '600' },
});
