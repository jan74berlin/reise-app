// mobile/app/(app)/trips/[id]/checklist.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, SectionList,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useChecklist } from '@/hooks/useChecklist';
import { useAuthStore } from '@/stores/authStore';
import { addItem, toggleItem, deleteItem } from '@/api/checklist';
import type { ChecklistItem } from '@/api/checklist';

export default function ChecklistScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const { data: items, isLoading } = useChecklist(tripId);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['checklist', tripId] });

  const toggleMut = useMutation({
    mutationFn: ({ id, checked }: { id: string; checked: boolean }) =>
      toggleItem(token!, tripId, id, checked),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteItem(token!, tripId, id),
    onSuccess: invalidate,
  });

  async function handleAdd() {
    if (!newText.trim()) return;
    try {
      await addItem(token!, tripId, newText.trim(), newCategory.trim() || undefined);
      setNewText('');
      invalidate();
    } catch (e: unknown) {
      Alert.alert('Fehler', e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
  }

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" testID="loading-indicator" /></View>;

  // Group by category
  const grouped: Record<string, ChecklistItem[]> = {};
  for (const item of items ?? []) {
    const cat = item.category ?? 'Sonstiges';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }
  const sections = Object.entries(grouped).map(([title, data]) => ({ title, data }));

  const done = items?.filter((i) => i.is_checked).length ?? 0;
  const total = items?.length ?? 0;

  return (
    <View style={s.container}>
      <View style={s.progress}>
        <Text style={s.progressText} testID="progress-text">{done}/{total} erledigt</Text>
        <View style={s.bar}>
          <View style={[s.fill, { width: total ? `${(done / total) * 100}%` : '0%' }]} />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={s.cat}>{title}</Text>
        )}
        renderItem={({ item }) => (
          <View style={s.itemRow} testID={`item-row-${item.id}`}>
            <TouchableOpacity
              style={[s.checkbox, item.is_checked && s.checked]}
              onPress={() => toggleMut.mutate({ id: item.id, checked: !item.is_checked })}
              testID={`toggle-${item.id}`}
            >
              {item.is_checked ? <Text style={s.checkMark}>✓</Text> : null}
            </TouchableOpacity>
            <Text style={[s.itemText, item.is_checked && s.strikethrough]}>{item.text}</Text>
            <TouchableOpacity
              onPress={() => deleteMut.mutate(item.id)}
              testID={`delete-${item.id}`}
            >
              <Text style={s.del}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty} testID="empty-state">Keine Items.</Text>}
      />

      <View style={s.addRow}>
        <TextInput
          style={s.catInput}
          placeholder="Kategorie"
          value={newCategory}
          onChangeText={setNewCategory}
          testID="category-input"
        />
        <TextInput
          style={s.textInput}
          placeholder="Neues Item"
          value={newText}
          onChangeText={setNewText}
          testID="text-input"
        />
        <TouchableOpacity style={s.addBtn} onPress={handleAdd} testID="add-btn">
          <Text style={s.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  progress: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  progressText: { fontSize: 13, color: '#6b7280', marginBottom: 6 },
  bar: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  fill: { height: 6, backgroundColor: '#16a34a', borderRadius: 3 },
  cat: { fontSize: 13, fontWeight: '700', color: '#6b7280', paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkMark: { color: '#fff', fontWeight: '700', fontSize: 13 },
  itemText: { flex: 1, fontSize: 15 },
  strikethrough: { textDecorationLine: 'line-through', color: '#9ca3af' },
  del: { color: '#ef4444', fontSize: 16, paddingHorizontal: 4 },
  addRow: { flexDirection: 'row', gap: 6, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#e5e7eb' },
  catInput: { width: 90, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13 },
  textInput: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, width: 38, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: '#fff', fontSize: 22, lineHeight: 26 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
});
