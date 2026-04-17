// mobile/components/TripCard.tsx
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import type { Trip } from '@/api/trips';

interface Props {
  trip: Trip;
  onPress: () => void;
}

export function TripCard({ trip, onPress }: Props) {
  const dates =
    trip.start_date && trip.end_date
      ? `${trip.start_date} – ${trip.end_date}`
      : trip.start_date ?? '';
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <Text style={s.title}>{trip.title}</Text>
      {dates ? <Text style={s.sub}>{dates}</Text> : null}
      {trip.description ? <Text style={s.desc} numberOfLines={2}>{trip.description}</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 4 },
  desc: { fontSize: 14, color: '#374151' },
});
