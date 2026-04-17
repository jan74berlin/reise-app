// mobile/app/(app)/trips/[id]/journal.tsx
import { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useJournal } from '@/hooks/useJournal';
import { JournalEntryCard } from '@/components/JournalEntryCard';
import { useAuthStore } from '@/stores/authStore';
import { createEntry, uploadPhoto } from '@/api/journal';

export default function JournalScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const { data: entries, isLoading } = useJournal(tripId);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  async function handlePost() {
    if (!text.trim()) return;
    setPosting(true);
    try {
      await createEntry(token!, tripId, text.trim());
      setText('');
      qc.invalidateQueries({ queryKey: ['journal', tripId] });
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setPosting(false);
    }
  }

  async function handlePhoto(entryId: string) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Berechtigung verweigert'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await uploadPhoto(token!, tripId, entryId, asset.uri, asset.mimeType ?? 'image/jpeg');
      qc.invalidateQueries({ queryKey: ['journal', tripId] });
    } catch (e: unknown) {
      Alert.alert('Upload fehlgeschlagen', e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
  }

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" testID="loading-indicator" /></View>;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View>
            <JournalEntryCard entry={item} />
            <TouchableOpacity
              style={s.photoBtn}
              onPress={() => handlePhoto(item.id)}
              testID={`photo-btn-${item.id}`}
            >
              <Text style={s.photoBtnText}>📷 Foto hinzufügen</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty} testID="empty-state">Noch keine Einträge.</Text>}
      />
      <View style={s.composer}>
        <TextInput
          style={s.input}
          placeholder="Neuer Eintrag..."
          value={text}
          onChangeText={setText}
          multiline
          testID="text-input"
        />
        <TouchableOpacity
          style={s.sendBtn}
          onPress={handlePost}
          disabled={posting || !text.trim()}
          testID="send-btn"
        >
          {posting
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.sendText}>↑</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  composer: { flexDirection: 'row', padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e5e7eb', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, maxHeight: 120 },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 20, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  photoBtn: { marginHorizontal: 16, marginTop: -6, marginBottom: 10 },
  photoBtnText: { color: '#6b7280', fontSize: 13 },
});
