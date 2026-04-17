// mobile/components/SpotCard.tsx
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import type { Spot } from '@/api/nights';

const ROLE_LABELS: Record<string, string> = {
  primary: 'Primär',
  alt1: 'Alternative 1',
  alt2: 'Alternative 2',
  altpick: 'Auswahl',
};

interface Props {
  spot: Spot;
  onSelect?: () => void;
}

export function SpotCard({ spot, onSelect }: Props) {
  function openInMaps() {
    if (spot.pn_id) Linking.openURL(`https://park4night.com/place/${spot.pn_id}`);
  }

  return (
    <View style={[s.card, spot.is_selected && s.selected]}>
      <View style={s.header}>
        <Text style={s.role}>{ROLE_LABELS[spot.role] ?? spot.role}</Text>
        {spot.is_selected && <Text style={s.check}>✓ Ausgewählt</Text>}
      </View>
      {spot.title ? <Text style={s.title}>{spot.title}</Text> : null}
      <Text style={s.coords}>{parseFloat(spot.lat).toFixed(4)}, {parseFloat(spot.lng).toFixed(4)}</Text>
      {spot.rating ? (
        <Text style={s.rating}>★ {parseFloat(spot.rating).toFixed(1)} ({spot.reviews} Bewertungen)</Text>
      ) : null}
      <View style={s.btnRow}>
        {spot.pn_id ? (
          <TouchableOpacity style={s.linkBtn} onPress={openInMaps}>
            <Text style={s.linkText}>park4night öffnen</Text>
          </TouchableOpacity>
        ) : null}
        {onSelect && !spot.is_selected ? (
          <TouchableOpacity style={s.selectBtn} onPress={onSelect} testID={`select-btn-${spot.night_spot_id}`}>
            <Text style={s.selectText}>Auswählen</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  selected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  role: { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  check: { fontSize: 12, color: '#2563eb', fontWeight: '600' },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  coords: { fontSize: 12, color: '#9ca3af' },
  rating: { fontSize: 13, color: '#f59e0b', marginTop: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f3f4f6', borderRadius: 6 },
  linkText: { fontSize: 13, color: '#374151' },
  selectBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#2563eb', borderRadius: 6 },
  selectText: { fontSize: 13, color: '#fff', fontWeight: '600' },
});
