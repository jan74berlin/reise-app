// mobile/components/NightCard.tsx
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { Night } from '@/api/nights';

interface Props {
  night: Night;
  onPress: () => void;
}

export function NightCard({ night, onPress }: Props) {
  const primary = night.spots.find((s) => s.role === 'primary' || s.is_selected);
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={s.row}>
        <Text style={s.num}>Nacht {night.night_number}</Text>
        {night.date ? <Text style={s.date}>{night.date}</Text> : null}
      </View>
      {primary?.title ? <Text style={s.spot} numberOfLines={1}>{primary.title}</Text> : null}
      {night.sights.length > 0 ? (
        <Text style={s.sights}>{night.sights.length} Sehenswürdigkeit{night.sights.length !== 1 ? 'en' : ''}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    marginBottom: 8, elevation: 1, shadowOpacity: 0.05, shadowRadius: 4, shadowColor: '#000',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  num: { fontWeight: '700', fontSize: 15 },
  date: { color: '#6b7280', fontSize: 13 },
  spot: { color: '#374151', fontSize: 14 },
  sights: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
});
