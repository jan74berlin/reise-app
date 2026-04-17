// mobile/app/(auth)/join.tsx
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { join } from '@/api/auth';
import { ApiError } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

export default function JoinScreen() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const data = await join(inviteCode, email, password, displayName);
      await setAuth(data.token, data.user);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError('Ein unbekannter Fehler ist aufgetreten.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.title}>Familie beitreten</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            testID="invite-code-input"
            style={styles.input}
            placeholder="Einladungscode"
            autoCapitalize="characters"
            value={inviteCode}
            onChangeText={setInviteCode}
          />
          <TextInput
            testID="email-input"
            style={styles.input}
            placeholder="E-Mail"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            testID="password-input"
            style={styles.input}
            placeholder="Passwort"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            testID="display-name-input"
            style={styles.input}
            placeholder="Dein Name"
            value={displayName}
            onChangeText={setDisplayName}
          />

          <TouchableOpacity
            testID="submit-button"
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Beitreten</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.link}>Anmelden</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  inner: {
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  error: {
    color: 'red',
    marginBottom: 8,
  },
  link: {
    color: '#2563EB',
    textAlign: 'center',
    marginTop: 8,
  },
});
