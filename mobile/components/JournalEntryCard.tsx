// mobile/components/JournalEntryCard.tsx
import { View, Text, StyleSheet } from 'react-native';
import { MediaGrid } from './MediaGrid';
import type { JournalEntry } from '@/api/journal';

interface Props {
  entry: JournalEntry;
}

export function JournalEntryCard({ entry }: Props) {
  const date = new Date(entry.created_at).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return (
    <View style={s.card} testID={`entry-card-${entry.id}`}>
      <Text style={s.date}>{date}</Text>
      {entry.text ? <Text style={s.text}>{entry.text}</Text> : null}
      <MediaGrid media={entry.media} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10 },
  date: { fontSize: 12, color: '#9ca3af', marginBottom: 6 },
  text: { fontSize: 15, color: '#111827', lineHeight: 22 },
});
