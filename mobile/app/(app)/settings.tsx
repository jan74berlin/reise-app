// mobile/app/(app)/settings.tsx
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useQueryClient } from '@tanstack/react-query';

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const qc = useQueryClient();
  const router = useRouter();

  async function handleLogout() {
    Alert.alert('Abmelden', 'Wirklich abmelden?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          await clearAuth();
          qc.clear();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <View style={s.container} testID="settings-screen">
      <View style={s.card}>
        <Text style={s.label}>Angemeldet als</Text>
        <Text style={s.value} testID="display-name">{user?.display_name ?? '–'}</Text>
        <Text style={s.label}>E-Mail</Text>
        <Text style={s.value} testID="email">{user?.email ?? '–'}</Text>
        <Text style={s.label}>Rolle</Text>
        <Text style={s.value} testID="role">{user?.role ?? '–'}</Text>
      </View>
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} testID="logout-btn">
        <Text style={s.logoutText}>Abmelden</Text>
      </TouchableOpacity>
      <Text style={s.version}>Reise-App · API: api.jan-toenhardt.de</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  label: { fontSize: 12, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, color: '#111827', marginTop: 2 },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 10, padding: 14, alignItems: 'center' },
  logoutText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  version: { textAlign: 'center', color: '#9ca3af', fontSize: 12, marginTop: 24 },
});
