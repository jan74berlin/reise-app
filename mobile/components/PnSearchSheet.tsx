// mobile/components/PnSearchSheet.tsx
import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, SafeAreaView,
} from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { searchPn } from '@/api/pn';
import type { PnSpot } from '@/api/pn';

interface Props {
  visible: boolean;
  lat: number;
  lng: number;
  onClose: () => void;
  onSelect: (spot: PnSpot, role: string) => void;
}

const ROLES = ['primary', 'alt1', 'alt2', 'altpick'];

export function PnSearchSheet({ visible, lat, lng, onClose, onSelect }: Props) {
  const token = useAuthStore((s) => s.token);
  const [spots, setSpots] = useState<PnSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<PnSpot | null>(null);

  async function search() {
    setLoading(true);
    try {
      const r = await searchPn(token!, lat, lng, 25);
      setSpots(Array.isArray(r.spots) ? r.spots.slice(0, 20) : []);
    } catch {
      setSpots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) search();
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>park4night (25km Radius)</Text>
          <TouchableOpacity onPress={onClose} testID="close-btn"><Text style={s.close}>✕</Text></TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" testID="search-loading" /></View>
        ) : selectedSpot ? (
          <View style={s.roleSelector}>
            <Text style={s.roleTitle}>Als welche Rolle hinzufügen?</Text>
            <Text style={s.spotName} testID="selected-spot-name">{selectedSpot.title_short}</Text>
            {ROLES.map((role) => (
              <TouchableOpacity
                key={role}
                style={s.roleBtn}
                testID={`role-btn-${role}`}
                onPress={() => { onSelect(selectedSpot, role); setSelectedSpot(null); }}
              >
                <Text style={s.roleBtnText}>{role}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSelectedSpot(null)} testID="back-btn">
              <Text style={s.back}>← Zurück</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={spots}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.item} onPress={() => setSelectedSpot(item)} testID={`spot-item-${item.id}`}>
                <Text style={s.itemTitle}>{item.title_short}</Text>
                <Text style={s.itemSub}>{item.type?.code} · ★ {item.rating?.toFixed(1)} ({item.review} Bew.)</Text>
                <Text style={s.itemCoord}>{item.lat.toFixed(4)}, {item.lng.toFixed(4)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty} testID="empty-results">Keine Ergebnisse</Text>}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 17, fontWeight: '700' },
  close: { fontSize: 20, color: '#6b7280' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { padding: 14, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  itemTitle: { fontSize: 15, fontWeight: '600' },
  itemSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  itemCoord: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  roleSelector: { padding: 24 },
  roleTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  spotName: { fontSize: 14, color: '#374151', marginBottom: 16 },
  roleBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, marginBottom: 8 },
  roleBtnText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  back: { color: '#6b7280', marginTop: 8 },
});
