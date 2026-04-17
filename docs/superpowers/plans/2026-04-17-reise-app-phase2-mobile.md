# Reise-App Phase 2: React Native Mobile App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React Native (Expo) mobile app that connects to the live backend API at `https://api.jan-toenhardt.de`, supporting trip browsing, spot maps, park4night search, journal with photo upload, and checklist.

**Architecture:** Expo Router (file-based routing), Zustand for auth state (JWT in SecureStore), TanStack Query v5 for server state. Maps via `react-native-maps` (requires development build for Android, not Expo Go). Backend API already live — no backend changes except adding a checklist router (Task 1) and a missing `PUT /journal/:entryId` endpoint.

**Tech Stack:** Expo SDK (latest), Expo Router, react-native-maps, expo-location, expo-image-picker, expo-secure-store, Zustand 4, TanStack Query 5, TypeScript, Jest + @testing-library/react-native

**Live credentials for testing:**
- API base: `https://api.jan-toenhardt.de`
- Jan: `jan@toenhardt.de` / `Jan74berlin`
- Baltikum trip ID: `1e619bca-974f-4feb-a19d-001d51eea93e`

---

## File Structure

```
mobile/
├── app/
│   ├── _layout.tsx              ← Root (auth guard + providers)
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── join.tsx
│   └── (app)/
│       ├── _layout.tsx          ← Tab bar (Trips / Settings)
│       ├── index.tsx            ← Trip list
│       ├── settings.tsx
│       └── trips/
│           └── [id]/
│               ├── _layout.tsx  ← Stack layout for trip screens
│               ├── index.tsx    ← Trip overview (nights list + map)
│               ├── checklist.tsx
│               ├── journal.tsx
│               └── nights/
│                   └── [n].tsx  ← Night detail (spots + sights)
├── api/
│   ├── client.ts               ← fetch wrapper
│   ├── auth.ts
│   ├── trips.ts
│   ├── nights.ts
│   ├── journal.ts
│   ├── checklist.ts
│   └── pn.ts
├── stores/
│   └── authStore.ts
├── hooks/
│   ├── useTrips.ts
│   ├── useNights.ts
│   ├── useJournal.ts
│   └── useChecklist.ts
├── components/
│   ├── TripCard.tsx
│   ├── NightCard.tsx
│   ├── SpotCard.tsx
│   ├── JournalEntryCard.tsx
│   └── MediaGrid.tsx
├── constants/
│   └── api.ts
├── __tests__/
│   ├── api.client.test.ts
│   └── authStore.test.ts
├── app.json
├── package.json
└── tsconfig.json
```

---

## Task 1: Checklist backend endpoint

Add the missing `/api/v1/trips/:tripId/checklist` router to the existing backend.

**Files:**
- Create: `backend/src/checklist/router.ts`
- Create: `backend/src/checklist/checklist.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/src/checklist/checklist.test.ts
import request from 'supertest';
import { app } from '../index';
import { pool } from '../db';
import { signToken } from '../jwt';

let token: string;
let tripId: string;

beforeAll(async () => {
  await pool.query('DELETE FROM families WHERE name = $1', ['CheckTest']);
  const f = await pool.query(
    "INSERT INTO families (name, invite_code) VALUES ('CheckTest','CHKTST01') RETURNING id"
  );
  const u = await pool.query(
    "INSERT INTO users (family_id, email, password_hash, display_name, role) VALUES ($1,'chk@test.de','x','Chk','owner') RETURNING id",
    [f.rows[0].id]
  );
  token = signToken({ userId: u.rows[0].id, familyId: f.rows[0].id, email: 'chk@test.de', role: 'owner' });
  await pool.query("SET LOCAL app.family_id = '" + f.rows[0].id + "'");
  const t = await pool.query(
    "INSERT INTO trips (family_id, title, created_by) VALUES ($1,'ChkTrip',$2) RETURNING id",
    [f.rows[0].id, u.rows[0].id]
  );
  tripId = t.rows[0].id;
});

afterAll(() => pool.end());

describe('Checklist API', () => {
  let itemId: string;

  it('POST creates item', async () => {
    const r = await request(app)
      .post(`/api/v1/trips/${tripId}/checklist`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'Camping', text: 'Schlafsack' });
    expect(r.status).toBe(201);
    expect(r.body.item.text).toBe('Schlafsack');
    expect(r.body.item.is_checked).toBe(false);
    itemId = r.body.item.id;
  });

  it('GET returns items', async () => {
    const r = await request(app)
      .get(`/api/v1/trips/${tripId}/checklist`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
  });

  it('PUT toggles checked', async () => {
    const r = await request(app)
      .put(`/api/v1/trips/${tripId}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_checked: true });
    expect(r.status).toBe(200);
    expect(r.body.item.is_checked).toBe(true);
  });

  it('DELETE removes item', async () => {
    const r = await request(app)
      .delete(`/api/v1/trips/${tripId}/checklist/${itemId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- checklist.test.ts
```
Expected: FAIL — router not found (404s)

- [ ] **Step 3: Implement checklist router**

```typescript
// backend/src/checklist/router.ts
import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';

export const checklistRouter = Router({ mergeParams: true });
checklistRouter.use(requireAuth);

checklistRouter.get('/', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  const r = await withFamily(req.user.familyId, (c) =>
    c.query('SELECT * FROM checklist_items WHERE trip_id = $1 ORDER BY id', [tripId])
  );
  res.json({ items: r.rows });
});

checklistRouter.post('/', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  const { category, text } = req.body;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  const r = await withFamily(req.user.familyId, (c) =>
    c.query(
      'INSERT INTO checklist_items (trip_id, category, text) VALUES ($1,$2,$3) RETURNING *',
      [tripId, category ?? null, text]
    )
  );
  res.status(201).json({ item: r.rows[0] });
});

checklistRouter.put('/:itemId', async (req, res) => {
  const { is_checked, text, category } = req.body;
  const r = await withFamily(req.user.familyId, async (c) => {
    if (is_checked !== undefined) {
      return c.query(
        `UPDATE checklist_items SET
           is_checked = $2,
           checked_by = CASE WHEN $2 THEN $3 ELSE NULL END,
           checked_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1 RETURNING *`,
        [req.params.itemId, is_checked, req.user.userId]
      );
    }
    return c.query(
      `UPDATE checklist_items SET
         text = COALESCE($2, text),
         category = COALESCE($3, category)
       WHERE id = $1 RETURNING *`,
      [req.params.itemId, text ?? null, category ?? null]
    );
  });
  if (!r.rows[0]) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ item: r.rows[0] });
});

checklistRouter.delete('/:itemId', async (req, res) => {
  await withFamily(req.user.familyId, (c) =>
    c.query('DELETE FROM checklist_items WHERE id = $1', [req.params.itemId])
  );
  res.status(204).send();
});
```

- [ ] **Step 4: Mount router in index.ts**

Add to `backend/src/index.ts` after the existing imports/mounts:

```typescript
import { checklistRouter } from './checklist/router';
// ...after other app.use() calls:
app.use('/api/v1/trips/:tripId/checklist', checklistRouter);
```

- [ ] **Step 5: Run tests**

```bash
cd backend && npm test -- checklist.test.ts
```
Expected: 4 passing

- [ ] **Step 6: Deploy backend**

```bash
cd backend && npm run build && cd ..
REISE_HOST=100.84.90.104 bash backend/deploy.sh
```

Expected: `✓ Deployed successfully`

- [ ] **Step 7: Commit**

```bash
git add backend/src/checklist/ backend/src/index.ts
git commit -m "feat(backend): add checklist CRUD endpoint"
```

---

## Task 2: Expo project bootstrap

**Files:**
- Create: `mobile/` (entire directory)
- Create: `mobile/app.json`
- Create: `mobile/app/_layout.tsx`
- Create: `mobile/constants/api.ts`
- Create: `mobile/tsconfig.json`

- [ ] **Step 1: Create Expo project**

From `C:\Users\Jan\Git\reise-app\`:
```bash
npx create-expo-app@latest mobile --template blank-typescript
```

- [ ] **Step 2: Install dependencies**

```bash
cd mobile
npx expo install expo-router expo-secure-store expo-location expo-image-picker expo-dev-client
npx expo install react-native-maps
npx expo install @tanstack/react-query
npm install zustand@^4.5.4
npm install -D @testing-library/react-native jest-expo
```

- [ ] **Step 3: Write app.json**

Replace `mobile/app.json` entirely:

```json
{
  "expo": {
    "name": "Reise",
    "slug": "reise-app",
    "version": "1.0.0",
    "scheme": "reise",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "splash": {
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "de.toenhardt.reise"
    },
    "android": {
      "package": "de.toenhardt.reise",
      "permissions": [
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION"
      ]
    },
    "web": {
      "bundler": "metro"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-location",
        {
          "locationWhenInUsePermission": "Wird für die Kartenansicht und Stellplatz-Suche verwendet."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Wird für das Reisetagebuch benötigt."
        }
      ],
      [
        "react-native-maps",
        {
          "googleMapsApiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      ]
    ]
  }
}
```

**Note:** Replace `YOUR_GOOGLE_MAPS_API_KEY` with a key from Google Cloud Console → APIs & Services → Credentials → Create API Key → restrict to "Maps SDK for Android". Project: `reise-app-493606`.

- [ ] **Step 4: Update package.json main field**

In `mobile/package.json`, set `"main": "expo-router/entry"` and update jest config:

```json
{
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "jest"
  },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|zustand)/)"
    ],
    "moduleNameMapper": {
      "^@/(.*)$": "<rootDir>/$1"
    },
    "setupFilesAfterFramework": ["@testing-library/react-native/extend-expect"]
  }
}
```

- [ ] **Step 5: Write tsconfig.json**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 6: Write constants/api.ts**

```typescript
// mobile/constants/api.ts
export const API_BASE = 'https://api.jan-toenhardt.de';
```

- [ ] **Step 7: Write root _layout.tsx**

```typescript
// mobile/app/_layout.tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function AuthGuard() {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    const inAuth = segments[0] === '(auth)';
    if (!token && !inAuth) router.replace('/(auth)/login');
    if (token && inAuth) router.replace('/(app)');
  }, [token, hydrated, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 8: Write placeholder screens to make routing work**

```typescript
// mobile/app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

```typescript
// mobile/app/(auth)/login.tsx
import { View, Text } from 'react-native';
export default function LoginScreen() {
  return <View><Text>Login (TODO)</Text></View>;
}
```

```typescript
// mobile/app/(app)/_layout.tsx
import { Tabs } from 'expo-router';
export default function AppLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Reisen' }} />
      <Tabs.Screen name="settings" options={{ title: 'Einstellungen' }} />
    </Tabs>
  );
}
```

```typescript
// mobile/app/(app)/index.tsx
import { View, Text } from 'react-native';
export default function TripsScreen() {
  return <View><Text>Trips (TODO)</Text></View>;
}
```

```typescript
// mobile/app/(app)/settings.tsx
import { View, Text } from 'react-native';
export default function SettingsScreen() {
  return <View><Text>Einstellungen (TODO)</Text></View>;
}
```

- [ ] **Step 9: Write authStore stub (needed by _layout.tsx)**

```typescript
// mobile/stores/authStore.ts
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'reise_jwt';

interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'member';
}

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  setAuth: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, user });
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, user: null });
  },

  hydrate: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    set({ token, hydrated: true });
  },
}));

// Call hydrate on module load
useAuthStore.getState().hydrate();
```

- [ ] **Step 10: Write authStore test**

```typescript
// mobile/__tests__/authStore.test.ts
import { useAuthStore } from '../stores/authStore';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

const mockUser = { id: '1', email: 'a@b.de', display_name: 'A', role: 'owner' as const };

test('setAuth stores token and user', async () => {
  await useAuthStore.getState().setAuth('tok123', mockUser);
  expect(useAuthStore.getState().token).toBe('tok123');
  expect(useAuthStore.getState().user).toEqual(mockUser);
});

test('clearAuth removes token', async () => {
  await useAuthStore.getState().clearAuth();
  expect(useAuthStore.getState().token).toBeNull();
});
```

- [ ] **Step 11: Run tests**

```bash
cd mobile && npm test -- authStore.test.ts
```
Expected: 2 passing

- [ ] **Step 12: Start Expo to verify routing works (Expo Go)**

```bash
cd mobile && npx expo start
```
Scan QR code with Expo Go on Android. Should show login placeholder screen. Expected: no crashes, "Login (TODO)" visible.

- [ ] **Step 13: Commit**

```bash
git add mobile/
git commit -m "feat(mobile): expo project bootstrap with routing shell and auth store"
```

---

## Task 3: API client

**Files:**
- Create: `mobile/api/client.ts`
- Create: `mobile/api/auth.ts`
- Create: `mobile/__tests__/api.client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// mobile/__tests__/api.client.test.ts
import { apiFetch, ApiError } from '../api/client';

global.fetch = jest.fn();

beforeEach(() => jest.resetAllMocks());

test('apiFetch sends Authorization header when token provided', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: 1 }),
  });
  await apiFetch('/health', { token: 'tok123' });
  const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('/health');
  expect((opts as RequestInit).headers).toMatchObject({
    Authorization: 'Bearer tok123',
  });
});

test('apiFetch throws ApiError on non-ok response', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'Invalid credentials' }),
  });
  await expect(apiFetch('/auth/login', {})).rejects.toThrow(ApiError);
});

test('ApiError has status and message', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 404,
    json: () => Promise.resolve({ error: 'Not found' }),
  });
  try {
    await apiFetch('/trips/x', {});
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(404);
    expect((e as ApiError).message).toBe('Not found');
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd mobile && npm test -- api.client.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement api/client.ts**

```typescript
// mobile/api/client.ts
import { API_BASE } from '@/constants/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions {
  token?: string | null;
  method?: string;
  body?: unknown;
  isMultipart?: boolean;
  formData?: FormData;
}

export async function apiFetch<T = unknown>(
  path: string,
  { token, method = 'GET', body, isMultipart, formData }: FetchOptions
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isMultipart) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isMultipart ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `HTTP ${res.status}`);
  return data as T;
}
```

- [ ] **Step 4: Implement api/auth.ts**

```typescript
// mobile/api/auth.ts
import { apiFetch } from './client';

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'member';
}

export interface Family {
  id: string;
  name: string;
  invite_code: string;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function register(
  email: string,
  password: string,
  display_name: string,
  family_name: string
) {
  return apiFetch<{ token: string; user: User; family: Family }>(
    '/api/v1/auth/register',
    { method: 'POST', body: { email, password, display_name, family_name } }
  );
}

export async function join(
  invite_code: string,
  email: string,
  password: string,
  display_name: string
) {
  return apiFetch<{ token: string; user: User }>('/api/v1/auth/join', {
    method: 'POST',
    body: { invite_code, email, password, display_name },
  });
}

export async function getMe(token: string) {
  return apiFetch<{ user: User }>('/api/v1/auth/me', { token });
}
```

- [ ] **Step 5: Run tests**

```bash
cd mobile && npm test -- api.client.test.ts
```
Expected: 3 passing

- [ ] **Step 6: Commit**

```bash
git add mobile/api/ mobile/__tests__/
git commit -m "feat(mobile): api client and auth API functions"
```

---

## Task 4: Auth screens (Login, Register, Join)

**Files:**
- Modify: `mobile/app/(auth)/login.tsx`
- Create: `mobile/app/(auth)/register.tsx`
- Create: `mobile/app/(auth)/join.tsx`

- [ ] **Step 1: Implement login.tsx**

```typescript
// mobile/app/(auth)/login.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { login } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Fehler', 'E-Mail und Passwort erforderlich');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await login(email.trim(), password);
      await setAuth(token, user);
      router.replace('/(app)');
    } catch (e: any) {
      Alert.alert('Anmeldung fehlgeschlagen', e.message ?? 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Text style={s.title}>Reise-App</Text>
      <TextInput
        style={s.input}
        placeholder="E-Mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        placeholder="Passwort"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Anmelden</Text>}
      </TouchableOpacity>
      <Link href="/(auth)/register" style={s.link}>Neue Familie registrieren</Link>
      <Link href="/(auth)/join" style={s.link}>Mit Einladungscode beitreten</Link>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 8 },
});
```

- [ ] **Step 2: Implement register.tsx**

```typescript
// mobile/app/(auth)/register.tsx
import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { register } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function RegisterScreen() {
  const [familyName, setFamilyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  async function handleRegister() {
    if (!familyName || !displayName || !email || !password) {
      Alert.alert('Fehler', 'Alle Felder ausfüllen');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await register(email.trim(), password, displayName, familyName);
      await setAuth(token, user);
      router.replace('/(app)');
    } catch (e: any) {
      Alert.alert('Registrierung fehlgeschlagen', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.title}>Neue Familie</Text>
        <TextInput style={s.input} placeholder="Familienname (z.B. Tönhardt)" value={familyName} onChangeText={setFamilyName} />
        <TextInput style={s.input} placeholder="Dein Name" value={displayName} onChangeText={setDisplayName} />
        <TextInput style={s.input} placeholder="E-Mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Passwort" secureTextEntry value={password} onChangeText={setPassword} />
        <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Familie anlegen</Text>}
        </TouchableOpacity>
        <Link href="/(auth)/login" style={s.link}>Zurück zur Anmeldung</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 8 },
});
```

- [ ] **Step 3: Implement join.tsx**

```typescript
// mobile/app/(auth)/join.tsx
import { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { join } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export default function JoinScreen() {
  const [inviteCode, setInviteCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  async function handleJoin() {
    if (!inviteCode || !displayName || !email || !password) {
      Alert.alert('Fehler', 'Alle Felder ausfüllen');
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await join(inviteCode.trim().toUpperCase(), email.trim(), password, displayName);
      await setAuth(token, user);
      router.replace('/(app)');
    } catch (e: any) {
      Alert.alert('Beitreten fehlgeschlagen', e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container}>
        <Text style={s.title}>Familie beitreten</Text>
        <TextInput style={s.input} placeholder="Einladungscode (z.B. ZBIWD6FZ)" autoCapitalize="characters" value={inviteCode} onChangeText={setInviteCode} />
        <TextInput style={s.input} placeholder="Dein Name" value={displayName} onChangeText={setDisplayName} />
        <TextInput style={s.input} placeholder="E-Mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Passwort" secureTextEntry value={password} onChangeText={setPassword} />
        <TouchableOpacity style={s.btn} onPress={handleJoin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Beitreten</Text>}
        </TouchableOpacity>
        <Link href="/(auth)/login" style={s.link}>Zurück zur Anmeldung</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 8 },
});
```

- [ ] **Step 4: Test manually in Expo Go**

```bash
cd mobile && npx expo start
```
Navigate to login screen → tap "Neue Familie registrieren" → tap back → tap "Mit Einladungscode beitreten" → tap back. No crashes expected.

Try login with `jan@toenhardt.de` / `Jan74berlin` — should redirect to trip list (shows "Trips (TODO)").

- [ ] **Step 5: Commit**

```bash
git add mobile/app/(auth)/
git commit -m "feat(mobile): auth screens (login, register, join)"
```

---

## Task 5: Trips API + Trip list screen

**Files:**
- Create: `mobile/api/trips.ts`
- Create: `mobile/hooks/useTrips.ts`
- Create: `mobile/components/TripCard.tsx`
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Write api/trips.ts**

```typescript
// mobile/api/trips.ts
import { apiFetch } from './client';

export interface Trip {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  vehicle_height: string | null;
  vehicle_length: string | null;
  vehicle_weight: number | null;
  vehicle_fuel: string | null;
  created_at: string;
}

export function getTrips(token: string) {
  return apiFetch<{ trips: Trip[] }>('/api/v1/trips', { token });
}

export function getTrip(token: string, id: string) {
  return apiFetch<{ trip: Trip }>(`/api/v1/trips/${id}`, { token });
}

export function createTrip(token: string, body: Partial<Trip> & { title: string }) {
  return apiFetch<{ trip: Trip }>('/api/v1/trips', { token, method: 'POST', body });
}
```

- [ ] **Step 2: Write hooks/useTrips.ts**

```typescript
// mobile/hooks/useTrips.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getTrips, getTrip } from '@/api/trips';

export function useTrips() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['trips'],
    queryFn: () => getTrips(token!),
    enabled: !!token,
    select: (data) => data.trips,
  });
}

export function useTrip(id: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['trips', id],
    queryFn: () => getTrip(token!, id),
    enabled: !!token && !!id,
    select: (data) => data.trip,
  });
}
```

- [ ] **Step 3: Write components/TripCard.tsx**

```typescript
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
```

- [ ] **Step 4: Implement (app)/index.tsx**

```typescript
// mobile/app/(app)/index.tsx
import { View, FlatList, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTrips } from '@/hooks/useTrips';
import { TripCard } from '@/components/TripCard';

export default function TripsScreen() {
  const router = useRouter();
  const { data: trips, isLoading, refetch, isRefetching } = useTrips();

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator size="large" /></View>;
  }

  return (
    <View style={s.container}>
      <FlatList
        data={trips}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() => router.push(`/(app)/trips/${item.id}`)}
          />
        )}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        ListEmptyComponent={<Text style={s.empty}>Keine Reisen vorhanden.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
});
```

- [ ] **Step 5: Test manually in Expo Go**

Login with `jan@toenhardt.de` / `Jan74berlin`. Trip list should show "Baltikum 2026" and any other trips. Pull to refresh works.

- [ ] **Step 6: Commit**

```bash
git add mobile/api/trips.ts mobile/hooks/useTrips.ts mobile/components/TripCard.tsx mobile/app/(app)/index.tsx
git commit -m "feat(mobile): trip list screen with TanStack Query"
```

---

## Task 6: Trip detail + Nights list

**Files:**
- Create: `mobile/api/nights.ts`
- Create: `mobile/hooks/useNights.ts`
- Create: `mobile/components/NightCard.tsx`
- Create: `mobile/app/(app)/trips/[id]/_layout.tsx`
- Create: `mobile/app/(app)/trips/[id]/index.tsx`

- [ ] **Step 1: Write api/nights.ts**

```typescript
// mobile/api/nights.ts
import { apiFetch } from './client';

export interface Spot {
  night_spot_id: string;
  role: 'primary' | 'alt1' | 'alt2' | 'altpick';
  is_selected: boolean;
  notes: string | null;
  pn_id: number | null;
  lat: string;
  lng: string;
  title: string | null;
  type_code: string | null;
  rating: string | null;
  reviews: number | null;
}

export interface Sight {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
}

export interface Night {
  id: string;
  night_number: number;
  date: string | null;
  lat_center: string | null;
  lng_center: string | null;
  notes: string | null;
  spots: Spot[];
  sights: Sight[];
}

export function getNights(token: string, tripId: string) {
  return apiFetch<{ nights: Night[] }>(`/api/v1/trips/${tripId}/nights`, { token });
}

export function selectSpot(token: string, tripId: string, nightNumber: number, nightSpotId: string, is_selected: boolean) {
  return apiFetch(`/api/v1/trips/${tripId}/nights/${nightNumber}/spots/${nightSpotId}`, {
    token, method: 'PUT', body: { is_selected },
  });
}
```

- [ ] **Step 2: Write hooks/useNights.ts**

```typescript
// mobile/hooks/useNights.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getNights } from '@/api/nights';

export function useNights(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['nights', tripId],
    queryFn: () => getNights(token!, tripId),
    enabled: !!token && !!tripId,
    select: (data) => data.nights,
  });
}
```

- [ ] **Step 3: Write components/NightCard.tsx**

```typescript
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
    marginBottom: 8, elevation: 1, shadowOpacity: 0.05, shadowRadius: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  num: { fontWeight: '700', fontSize: 15 },
  date: { color: '#6b7280', fontSize: 13 },
  spot: { color: '#374151', fontSize: 14 },
  sights: { color: '#9ca3af', fontSize: 12, marginTop: 2 },
});
```

- [ ] **Step 4: Write trips/[id]/_layout.tsx**

```typescript
// mobile/app/(app)/trips/[id]/_layout.tsx
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTrip } from '@/hooks/useTrips';

export default function TripLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: trip } = useTrip(id);
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: trip?.title ?? 'Reise' }} />
      <Stack.Screen name="checklist" options={{ title: 'Checkliste' }} />
      <Stack.Screen name="journal" options={{ title: 'Tagebuch' }} />
      <Stack.Screen name="nights/[n]" options={{ title: 'Nacht' }} />
    </Stack>
  );
}
```

- [ ] **Step 5: Write trips/[id]/index.tsx**

```typescript
// mobile/app/(app)/trips/[id]/index.tsx
import { View, FlatList, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNights } from '@/hooks/useNights';
import { NightCard } from '@/components/NightCard';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: nights, isLoading } = useNights(id);

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" /></View>;

  return (
    <View style={s.container}>
      <View style={s.actions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/journal`)}>
          <Text style={s.actionText}>📓 Tagebuch</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/checklist`)}>
          <Text style={s.actionText}>✅ Checkliste</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={nights}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NightCard
            night={item}
            onPress={() => router.push(`/(app)/trips/${id}/nights/${item.night_number}`)}
          />
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Keine Etappen.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  list: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  actions: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  actionBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 6: Add placeholder screens**

```typescript
// mobile/app/(app)/trips/[id]/checklist.tsx
import { View, Text } from 'react-native';
export default function ChecklistScreen() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Checkliste (kommt in Task 10)</Text></View>;
}
```

```typescript
// mobile/app/(app)/trips/[id]/journal.tsx
import { View, Text } from 'react-native';
export default function JournalScreen() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Tagebuch (kommt in Task 9)</Text></View>;
}
```

- [ ] **Step 7: Test manually**

Login → trip list → tap "Baltikum 2026" → should show 21 NightCards (Nacht 1–21) with dates and spot titles. Tap "Tagebuch" / "Checkliste" shows placeholder.

- [ ] **Step 8: Commit**

```bash
git add mobile/api/nights.ts mobile/hooks/useNights.ts mobile/components/NightCard.tsx mobile/app/(app)/trips/
git commit -m "feat(mobile): trip detail screen with nights list"
```

---

## Task 7: Night detail screen (spots + sights)

**Files:**
- Create: `mobile/components/SpotCard.tsx`
- Create: `mobile/app/(app)/trips/[id]/nights/[n].tsx`

- [ ] **Step 1: Write components/SpotCard.tsx**

```typescript
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
    const url = `https://park4night.com/place/${spot.pn_id}`;
    if (spot.pn_id) Linking.openURL(url);
  }

  return (
    <View style={[s.card, spot.is_selected && s.selected]}>
      <View style={s.header}>
        <Text style={s.role}>{ROLE_LABELS[spot.role] ?? spot.role}</Text>
        {spot.is_selected && <Text style={s.check}>✓ Ausgewählt</Text>}
      </View>
      {spot.title ? <Text style={s.title}>{spot.title}</Text> : null}
      <Text style={s.coords}>{parseFloat(spot.lat).toFixed(4)}, {parseFloat(spot.lng).toFixed(4)}</Text>
      {spot.rating ? <Text style={s.rating}>★ {parseFloat(spot.rating).toFixed(1)} ({spot.reviews} Bewertungen)</Text> : null}
      <View style={s.btnRow}>
        {spot.pn_id ? (
          <TouchableOpacity style={s.linkBtn} onPress={openInMaps}>
            <Text style={s.linkText}>park4night öffnen</Text>
          </TouchableOpacity>
        ) : null}
        {onSelect && !spot.is_selected ? (
          <TouchableOpacity style={s.selectBtn} onPress={onSelect}>
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
```

- [ ] **Step 2: Write nights/[n].tsx**

```typescript
// mobile/app/(app)/trips/[id]/nights/[n].tsx
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNights } from '@/hooks/useNights';
import { SpotCard } from '@/components/SpotCard';
import { useAuthStore } from '@/stores/authStore';
import { selectSpot } from '@/api/nights';

export default function NightDetailScreen() {
  const { id: tripId, n } = useLocalSearchParams<{ id: string; n: string }>();
  const { data: nights, isLoading } = useNights(tripId);
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();

  const night = nights?.find((nt) => String(nt.night_number) === n);

  const selectMut = useMutation({
    mutationFn: ({ nightSpotId }: { nightSpotId: string }) =>
      selectSpot(token!, tripId, parseInt(n), nightSpotId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['nights', tripId] }),
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" /></View>;
  if (!night) return <View style={s.center}><Text>Nacht nicht gefunden</Text></View>;

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <Text style={s.heading}>Nacht {night.night_number}</Text>
      {night.date ? <Text style={s.date}>{night.date}</Text> : null}

      {night.notes ? (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Notizen</Text>
          <Text style={s.notes}>{night.notes}</Text>
        </View>
      ) : null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Stellplätze</Text>
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
            <View key={sight.id} style={s.sightCard}>
              <Text style={s.sightName}>{sight.name}</Text>
              {sight.description ? <Text style={s.sightDesc}>{sight.description}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  date: { color: '#6b7280', marginBottom: 12 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 4 },
  notes: { fontSize: 14, color: '#374151', lineHeight: 20 },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
  sightCard: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8 },
  sightName: { fontSize: 15, fontWeight: '600' },
  sightDesc: { fontSize: 13, color: '#6b7280', marginTop: 2 },
});
```

- [ ] **Step 3: Test manually**

Tap any night from the trip detail → should show spots (Baltikum has primary + alt spots per night) with "park4night öffnen" button. Tapping "Auswählen" on an alt spot should mark it selected.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/SpotCard.tsx mobile/app/(app)/trips/[id]/nights/
git commit -m "feat(mobile): night detail screen with spots and sights"
```

---

## Task 8: Map integration (react-native-maps + GPS)

**Note:** `react-native-maps` requires a **development build** — Expo Go is NOT sufficient from this task onward. You need Android Studio installed, OR a physical Android device.

**Files:**
- Modify: `mobile/app.json` (add Google Maps API key)
- Modify: `mobile/app/(app)/trips/[id]/index.tsx` (add map above nights list)
- Modify: `mobile/app/(app)/trips/[id]/nights/[n].tsx` (add mini-map)

- [ ] **Step 1: Get Google Maps API Key**

1. Go to `https://console.cloud.google.com/apis/credentials?project=reise-app-493606`
2. Click "Anmeldedaten erstellen" → "API-Schlüssel"
3. Rename to "reise-app-android-maps"
4. Click "Schlüssel einschränken" → Application restrictions: "Android apps" → add package `de.toenhardt.reise`
5. API restrictions: "Maps SDK for Android"
6. Copy the key

- [ ] **Step 2: Update app.json with key**

In `mobile/app.json`, replace `YOUR_GOOGLE_MAPS_API_KEY` with the actual key.

Also add `googleMapsApiKey` to the Android config:
```json
"android": {
  "package": "de.toenhardt.reise",
  "googleServicesFile": null,
  "permissions": ["..."],
  "config": {
    "googleMaps": {
      "apiKey": "YOUR_ACTUAL_KEY_HERE"
    }
  }
}
```

- [ ] **Step 3: Build development APK (Android)**

```bash
cd mobile
npx expo prebuild --platform android --clean
npx expo run:android
```

Expected: App builds and installs on connected Android device or emulator. If no device: `npx expo run:android --device` or set up emulator in Android Studio (AVD Manager → Pixel 7 API 34).

- [ ] **Step 4: Add map to trip detail (trips/[id]/index.tsx)**

Replace `mobile/app/(app)/trips/[id]/index.tsx` entirely:

```typescript
// mobile/app/(app)/trips/[id]/index.tsx
import { View, FlatList, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useNights } from '@/hooks/useNights';
import { NightCard } from '@/components/NightCard';

const { width } = Dimensions.get('window');

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: nights, isLoading } = useNights(id);

  const nightsWithCoords = nights?.filter((n) => n.lat_center && n.lng_center) ?? [];
  const initialRegion = nightsWithCoords.length > 0 ? {
    latitude: parseFloat(nightsWithCoords[0].lat_center!),
    longitude: parseFloat(nightsWithCoords[0].lng_center!),
    latitudeDelta: 8,
    longitudeDelta: 8,
  } : { latitude: 54, longitude: 24, latitudeDelta: 12, longitudeDelta: 12 };

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" /></View>;

  return (
    <View style={s.container}>
      <MapView
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
      >
        {nightsWithCoords.map((night) => (
          <Marker
            key={night.id}
            coordinate={{
              latitude: parseFloat(night.lat_center!),
              longitude: parseFloat(night.lng_center!),
            }}
            title={`Nacht ${night.night_number}`}
            description={night.date ?? undefined}
            onCalloutPress={() => router.push(`/(app)/trips/${id}/nights/${night.night_number}`)}
          />
        ))}
      </MapView>

      <View style={s.actions}>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/journal`)}>
          <Text style={s.actionText}>📓 Tagebuch</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => router.push(`/(app)/trips/${id}/checklist`)}>
          <Text style={s.actionText}>✅ Checkliste</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={nights}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NightCard
            night={item}
            onPress={() => router.push(`/(app)/trips/${id}/nights/${item.night_number}`)}
          />
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Keine Etappen.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  map: { width, height: 220 },
  list: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 48 },
  actions: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  actionBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 10, alignItems: 'center' },
  actionText: { fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 5: Add GPS + mini-map to night detail**

Add at the top of `mobile/app/(app)/trips/[id]/nights/[n].tsx`, after the existing imports:

```typescript
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

// Inside the component, after the existing state:
const [gpsPos, setGpsPos] = useState<{ latitude: number; longitude: number } | null>(null);

useEffect(() => {
  (async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setGpsPos({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
  })();
}, []);
```

Add mini-map above the spots section (inside the ScrollView, after the date Text):

```typescript
{(night.lat_center && night.lng_center) ? (
  <MapView
    style={{ height: 180, borderRadius: 10, marginBottom: 16 }}
    provider={PROVIDER_GOOGLE}
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
```

- [ ] **Step 6: Rebuild and test**

```bash
cd mobile && npx expo run:android
```

Trip detail: map shows Baltikum route markers (Estonia/Latvia/Lithuania). Night detail: mini-map with spot pins + GPS circle.

- [ ] **Step 7: Commit**

```bash
git add mobile/app.json mobile/app/(app)/trips/
git commit -m "feat(mobile): maps integration with GPS and night spot markers"
```

---

## Task 9: park4night search

**Files:**
- Create: `mobile/api/pn.ts`
- Create: `mobile/components/PnSearchSheet.tsx`
- Modify: `mobile/app/(app)/trips/[id]/nights/[n].tsx`

- [ ] **Step 1: Write api/pn.ts**

```typescript
// mobile/api/pn.ts
import { apiFetch } from './client';

export interface PnSpot {
  id: number;
  lat: number;
  lng: number;
  title_short: string;
  type: { code: string };
  rating: number;
  review: number;
}

export function searchPn(token: string, lat: number, lng: number, radius = 25) {
  const filter = JSON.stringify({
    type: ['PN', 'APN', 'ACC_G'],
    services: [], activities: [],
    maxHeight: '0', all_year: '0',
    booking_filter: '0', custom_type: [],
  });
  return apiFetch<{ spots: PnSpot[] }>(
    `/api/v1/pn/around?lat=${lat}&lng=${lng}&radius=${radius}&filter=${encodeURIComponent(filter)}`,
    { token }
  );
}
```

- [ ] **Step 2: Write components/PnSearchSheet.tsx**

```typescript
// mobile/components/PnSearchSheet.tsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, SafeAreaView,
} from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { searchPn, PnSpot } from '@/api/pn';

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
    } catch (e) {
      setSpots([]);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    search();
  }

  return (
    <Modal visible={visible} animationType="slide" onShow={handleOpen} onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>park4night (25km Radius)</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.center}><ActivityIndicator size="large" /></View>
        ) : selectedSpot ? (
          <View style={s.roleSelector}>
            <Text style={s.roleTitle}>Als welche Rolle hinzufügen?</Text>
            <Text style={s.spotName}>{selectedSpot.title_short}</Text>
            {ROLES.map((role) => (
              <TouchableOpacity key={role} style={s.roleBtn} onPress={() => { onSelect(selectedSpot, role); setSelectedSpot(null); }}>
                <Text style={s.roleBtnText}>{role}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setSelectedSpot(null)}>
              <Text style={s.back}>← Zurück</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={spots}
            keyExtractor={(s) => String(s.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.item} onPress={() => setSelectedSpot(item)}>
                <Text style={s.itemTitle}>{item.title_short}</Text>
                <Text style={s.itemSub}>{item.type?.code} · ★ {item.rating?.toFixed(1)} ({item.review} Bew.)</Text>
                <Text style={s.itemCoord}>{item.lat.toFixed(4)}, {item.lng.toFixed(4)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={s.empty}>Keine Ergebnisse</Text>}
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
```

- [ ] **Step 3: Wire up PnSearchSheet in nights/[n].tsx**

Add to `mobile/app/(app)/trips/[id]/nights/[n].tsx`:

Import at top:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PnSearchSheet } from '@/components/PnSearchSheet';
import { apiFetch } from '@/api/client';
import type { PnSpot } from '@/api/pn';
```

State + mutation inside component:
```typescript
const [showPnSearch, setShowPnSearch] = useState(false);
const qc = useQueryClient();

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
```

Add button to the spots section (after `sectionTitle` "Stellplätze"):
```typescript
<TouchableOpacity style={s.searchBtn} onPress={() => setShowPnSearch(true)}>
  <Text style={s.searchBtnText}>+ Stellplatz suchen (park4night)</Text>
</TouchableOpacity>
```

Add before closing `</ScrollView>`:
```typescript
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
```

Add styles:
```typescript
searchBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#16a34a', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 8 },
searchBtnText: { color: '#16a34a', fontWeight: '600' },
```

- [ ] **Step 4: Test manually**

On any night detail screen, tap "+ Stellplatz suchen" → modal opens → fetches park4night spots within 25km → tap a spot → choose role → spot appears in night's spot list.

- [ ] **Step 5: Commit**

```bash
git add mobile/api/pn.ts mobile/components/PnSearchSheet.tsx mobile/app/(app)/trips/[id]/nights/
git commit -m "feat(mobile): park4night search with spot assignment"
```

---

## Task 10: Journal + photo upload

**Files:**
- Create: `mobile/api/journal.ts`
- Create: `mobile/hooks/useJournal.ts`
- Create: `mobile/components/JournalEntryCard.tsx`
- Create: `mobile/components/MediaGrid.tsx`
- Modify: `mobile/app/(app)/trips/[id]/journal.tsx`

- [ ] **Step 1: Write api/journal.ts**

```typescript
// mobile/api/journal.ts
import { apiFetch } from './client';

export interface MediaItem {
  id: string;
  drive_file_id: string;
  drive_view_url: string;
  filename: string;
  caption: string | null;
  taken_at: string | null;
}

export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id: string | null;
  user_id: string | null;
  text: string | null;
  created_at: string;
  updated_at: string;
  media: MediaItem[];
}

export function getJournal(token: string, tripId: string) {
  return apiFetch<{ entries: JournalEntry[] }>(`/api/v1/trips/${tripId}/journal`, { token });
}

export function createEntry(token: string, tripId: string, text: string, night_id?: string) {
  return apiFetch<{ entry: JournalEntry }>(`/api/v1/trips/${tripId}/journal`, {
    token, method: 'POST', body: { text, night_id },
  });
}

export function uploadPhoto(token: string, tripId: string, entryId: string, uri: string, mimeType: string) {
  const fd = new FormData();
  fd.append('photo', { uri, name: 'photo.jpg', type: mimeType } as any);
  return apiFetch<{ media: MediaItem }>(`/api/v1/trips/${tripId}/journal/${entryId}/media`, {
    token, method: 'POST', isMultipart: true, formData: fd,
  });
}
```

- [ ] **Step 2: Write hooks/useJournal.ts**

```typescript
// mobile/hooks/useJournal.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getJournal } from '@/api/journal';

export function useJournal(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['journal', tripId],
    queryFn: () => getJournal(token!, tripId),
    enabled: !!token && !!tripId,
    select: (d) => d.entries,
  });
}
```

- [ ] **Step 3: Write components/MediaGrid.tsx**

```typescript
// mobile/components/MediaGrid.tsx
import { View, Image, StyleSheet, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useState } from 'react';
import type { MediaItem } from '@/api/journal';

const SIZE = (Dimensions.get('window').width - 48) / 3;

interface Props {
  media: MediaItem[];
}

export function MediaGrid({ media }: Props) {
  const [preview, setPreview] = useState<string | null>(null);
  if (media.length === 0) return null;
  return (
    <>
      <View style={s.grid}>
        {media.map((m) => (
          <TouchableOpacity key={m.id} onPress={() => setPreview(m.drive_view_url)}>
            <Image source={{ uri: m.drive_view_url }} style={s.thumb} />
          </TouchableOpacity>
        ))}
      </View>
      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <TouchableOpacity style={s.overlay} onPress={() => setPreview(null)}>
          <Image source={{ uri: preview ?? '' }} style={s.fullImg} resizeMode="contain" />
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  thumb: { width: SIZE, height: SIZE, borderRadius: 4, backgroundColor: '#f3f4f6' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
  fullImg: { width: '100%', height: '80%' },
});
```

- [ ] **Step 4: Write components/JournalEntryCard.tsx**

```typescript
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
    <View style={s.card}>
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
```

- [ ] **Step 5: Implement journal.tsx**

```typescript
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
  const { data: entries, isLoading, refetch } = useJournal(tripId);
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
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
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
    } catch (e: any) {
      Alert.alert('Upload fehlgeschlagen', e.message);
    }
  }

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" /></View>;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View>
            <JournalEntryCard entry={item} />
            <TouchableOpacity style={s.photoBtn} onPress={() => handlePhoto(item.id)}>
              <Text style={s.photoBtnText}>📷 Foto hinzufügen</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>Noch keine Einträge.</Text>}
        inverted={false}
      />
      <View style={s.composer}>
        <TextInput
          style={s.input}
          placeholder="Neuer Eintrag..."
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={s.sendBtn} onPress={handlePost} disabled={posting || !text.trim()}>
          {posting ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>↑</Text>}
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
```

- [ ] **Step 6: Test manually**

Navigate to a trip → "Tagebuch" → type text → send → entry appears. Tap "📷 Foto hinzufügen" → pick photo → photo appears in entry grid → tap photo for full-screen preview.

- [ ] **Step 7: Commit**

```bash
git add mobile/api/journal.ts mobile/hooks/useJournal.ts mobile/components/ mobile/app/(app)/trips/[id]/journal.tsx
git commit -m "feat(mobile): journal screen with photo upload"
```

---

## Task 11: Checklist screen

**Files:**
- Create: `mobile/api/checklist.ts`
- Create: `mobile/hooks/useChecklist.ts`
- Modify: `mobile/app/(app)/trips/[id]/checklist.tsx`

- [ ] **Step 1: Write api/checklist.ts**

```typescript
// mobile/api/checklist.ts
import { apiFetch } from './client';

export interface ChecklistItem {
  id: string;
  trip_id: string;
  category: string | null;
  text: string;
  is_checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
}

export function getChecklist(token: string, tripId: string) {
  return apiFetch<{ items: ChecklistItem[] }>(`/api/v1/trips/${tripId}/checklist`, { token });
}

export function addItem(token: string, tripId: string, text: string, category?: string) {
  return apiFetch<{ item: ChecklistItem }>(`/api/v1/trips/${tripId}/checklist`, {
    token, method: 'POST', body: { text, category },
  });
}

export function toggleItem(token: string, tripId: string, itemId: string, is_checked: boolean) {
  return apiFetch<{ item: ChecklistItem }>(`/api/v1/trips/${tripId}/checklist/${itemId}`, {
    token, method: 'PUT', body: { is_checked },
  });
}

export function deleteItem(token: string, tripId: string, itemId: string) {
  return apiFetch(`/api/v1/trips/${tripId}/checklist/${itemId}`, { token, method: 'DELETE' });
}
```

- [ ] **Step 2: Write hooks/useChecklist.ts**

```typescript
// mobile/hooks/useChecklist.ts
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getChecklist } from '@/api/checklist';

export function useChecklist(tripId: string) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['checklist', tripId],
    queryFn: () => getChecklist(token!, tripId),
    enabled: !!token && !!tripId,
    select: (d) => d.items,
  });
}
```

- [ ] **Step 3: Implement checklist.tsx**

```typescript
// mobile/app/(app)/trips/[id]/checklist.tsx
import { useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
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
    } catch (e: any) {
      Alert.alert('Fehler', e.message);
    }
  }

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" /></View>;

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
        <Text style={s.progressText}>{done}/{total} erledigt</Text>
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
          <View style={s.itemRow}>
            <TouchableOpacity
              style={[s.checkbox, item.is_checked && s.checked]}
              onPress={() => toggleMut.mutate({ id: item.id, checked: !item.is_checked })}
            >
              {item.is_checked ? <Text style={s.checkMark}>✓</Text> : null}
            </TouchableOpacity>
            <Text style={[s.itemText, item.is_checked && s.strikethrough]}>{item.text}</Text>
            <TouchableOpacity onPress={() => deleteMut.mutate(item.id)}>
              <Text style={s.del}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={s.list}
      />

      <View style={s.addRow}>
        <TextInput style={s.catInput} placeholder="Kategorie" value={newCategory} onChangeText={setNewCategory} />
        <TextInput style={s.textInput} placeholder="Neues Item" value={newText} onChangeText={setNewText} />
        <TouchableOpacity style={s.addBtn} onPress={handleAdd}>
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
});
```

- [ ] **Step 4: Test manually**

Navigate to a trip → "Checkliste" → add items with categories → toggle checked → progress bar updates → delete item.

- [ ] **Step 5: Commit**

```bash
git add mobile/api/checklist.ts mobile/hooks/useChecklist.ts mobile/app/(app)/trips/[id]/checklist.tsx
git commit -m "feat(mobile): checklist screen with categories and progress"
```

---

## Task 12: Settings screen + final polish

**Files:**
- Modify: `mobile/app/(app)/settings.tsx`
- Modify: `mobile/app/(app)/_layout.tsx` (add tab icons)

- [ ] **Step 1: Implement settings.tsx**

```typescript
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
    <View style={s.container}>
      <View style={s.card}>
        <Text style={s.label}>Angemeldet als</Text>
        <Text style={s.value}>{user?.display_name ?? '–'}</Text>
        <Text style={s.label}>E-Mail</Text>
        <Text style={s.value}>{user?.email ?? '–'}</Text>
        <Text style={s.label}>Rolle</Text>
        <Text style={s.value}>{user?.role ?? '–'}</Text>
      </View>
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
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
```

- [ ] **Step 2: Load user after login**

The auth store only stores the token from `setAuth`, but needs the user object. The login screen already passes `user` to `setAuth`. Verify `stores/authStore.ts` stores user correctly — `setAuth` signature is `(token: string, user: User)`. Settings screen reads `useAuthStore((s) => s.user)`. This should work since login passes the user object.

To persist user across restarts, update `hydrate()` in authStore:

```typescript
// In stores/authStore.ts, add USER_KEY constant:
const USER_KEY = 'reise_user';

// In setAuth:
setAuth: async (token, user) => {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  set({ token, user });
},

// In clearAuth:
clearAuth: async () => {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  set({ token: null, user: null });
},

// In hydrate:
hydrate: async () => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const userStr = await SecureStore.getItemAsync(USER_KEY);
  const user = userStr ? JSON.parse(userStr) : null;
  set({ token, user, hydrated: true });
},
```

- [ ] **Step 3: Final commit**

```bash
git add mobile/app/(app)/settings.tsx mobile/stores/authStore.ts
git commit -m "feat(mobile): settings screen with logout + persistent user"
```

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

---

## Self-Review

### Spec coverage:
- ✅ Auth screens (login, register, join)
- ✅ Trip list
- ✅ Trip detail with nights
- ✅ Night detail with spots + sights
- ✅ Map integration (react-native-maps)
- ✅ GPS location
- ✅ park4night search
- ✅ Journal (text + photo upload)
- ✅ Checklist with categories
- ✅ Settings + logout
- ✅ Backend checklist endpoint (Task 1)
- ⏭️ WebSocket sync — deferred to Phase 3 (offline first)
- ⏭️ Offline SQLite cache — deferred to Phase 3

### Type consistency:
- `Spot.lat` / `Spot.lng` are `string` (from PostgreSQL NUMERIC) — all usages call `parseFloat()` ✅
- `MediaItem.drive_view_url` used consistently for photo display ✅
- `Night.night_number` is `number` — route param `[n]` is string, compared with `String(night.night_number)` ✅

### No placeholders:
- All code blocks are complete
- No "TBD" or "implement later"
