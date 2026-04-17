# Tagebuch-PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine PWA mit zwei Modi (📱 schneller Foto-Upload / 🖥 Block-Editor) die das bestehende api.jan-toenhardt.de Backend nutzt.

**Architecture:** Vite + React (TypeScript) als statische PWA auf LXC 111, erreichbar über `tagebuch.jan-toenhardt.de`. Backend bekommt eine neue `blocks JSONB`-Spalte in `journal_entries` und neue PUT/DELETE-Endpunkte. Drag & Drop via SortableJS, Bildverkleinerung via Canvas API client-seitig.

**Tech Stack:** Vite 5, React 19, React Router v6, SortableJS 1.15, Vitest (Backend-Tests), TypeScript

---

## File Map

```
backend/
  migrations/003_journal_blocks.sql          NEU — blocks-Spalte + PUT/DELETE-Endpunkte
  src/journal/router.ts                       MOD — blocks in GET/POST, neu: PUT /:id, DELETE /:id, DELETE /:id/media/:mediaId

pwa/                                          NEU — komplett neues Vite-Projekt
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  public/
    manifest.json                             PWA-Manifest
  src/
    main.tsx                                  React-Einstiegspunkt
    App.tsx                                   Router + Auth-Guard
    types.ts                                  Shared TypeScript-Typen
    api/
      client.ts                               Base-Fetch mit JWT + Error-Handling
      auth.ts                                 login(), me()
      trips.ts                                getTrips(), createTrip()
      journal.ts                              getEntries(), createEntry(), updateEntry(), deleteEntry(), uploadMedia(), deleteMedia()
    contexts/
      AuthContext.tsx                         JWT + User-State
      ModeContext.tsx                         📱/🖥 Umschalter, localStorage-Persistenz
    pages/
      LoginPage.tsx
      TripsPage.tsx
      TripPage.tsx
      JournalEntryPage.tsx                    beide Modi (mobile upload / desktop editor)
      JournalEntryViewPage.tsx                Leseansicht mit Lightbox
    components/
      ModeToggle.tsx
      PhotoUpload.tsx                         Canvas-Resize + Galerie-Input + Upload
      BlockEditor.tsx                         SortableJS Drag & Drop, Text+Bild-Blöcke
      Lightbox.tsx
    utils/
      resizeImage.ts                          Canvas-Resize-Logik (isoliert, testbar)
    __tests__/
      resizeImage.test.ts
      apiClient.test.ts
```

---

## Task 1: Backend — Migration + Blocks-Support

**Files:**
- Create: `backend/migrations/003_journal_blocks.sql`
- Modify: `backend/src/journal/router.ts`

- [ ] **Schritt 1: Migration schreiben**

Datei `backend/migrations/003_journal_blocks.sql`:
```sql
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS blocks JSONB;
```

- [ ] **Schritt 2: Migration auf LXC 111 anwenden**

```bash
ssh root@100.84.90.104 "psql -U reise -d reise -c \"ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS blocks JSONB;\""
```
Erwartete Ausgabe: `ALTER TABLE`

- [ ] **Schritt 3: GET — blocks in Response aufnehmen**

In `backend/src/journal/router.ts`, im GET `/` Handler die `entries.rows` Schleife so anpassen:
```typescript
for (const e of entries.rows) {
  const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1 ORDER BY created_at', [e.id]);
  e.media = m.rows;
  // blocks ist bereits in SELECT * enthalten
}
```
(Keine Änderung nötig — `SELECT *` gibt `blocks` bereits zurück. Schritt nur zur Verifikation.)

- [ ] **Schritt 4: POST — blocks entgegennehmen**

Im POST `/` Handler `blocks` aus `req.body` lesen:
```typescript
journalRouter.post('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, night_id, blocks } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO journal_entries (trip_id, night_id, user_id, text, blocks) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [params.tripId, night_id ?? null, req.user.userId, text ?? null, blocks ? JSON.stringify(blocks) : null]
      )
    );
    res.status(201).json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Schritt 5: PUT /:entryId hinzufügen**

Nach dem POST-Handler einfügen:
```typescript
journalRouter.put('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, blocks } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        `UPDATE journal_entries
         SET text = COALESCE($1, text),
             blocks = COALESCE($2::jsonb, blocks),
             updated_at = now()
         WHERE id = $3 AND trip_id = $4
         RETURNING *`,
        [text ?? null, blocks ? JSON.stringify(blocks) : null, params.entryId, params.tripId]
      )
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Schritt 6: DELETE /:entryId hinzufügen**

```typescript
journalRouter.delete('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  try {
    await withFamily(req.user.familyId, (c) =>
      c.query(
        'DELETE FROM journal_entries WHERE id = $1 AND trip_id = $2',
        [params.entryId, params.tripId]
      )
    );
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Schritt 7: DELETE /:entryId/media/:mediaId hinzufügen**

```typescript
journalRouter.delete('/:entryId/media/:mediaId', async (req, res) => {
  const params = req.params as Record<string, string>;
  try {
    await withFamily(req.user.familyId, async (c) => {
      const m = await c.query(
        'SELECT drive_file_id FROM media WHERE id = $1 AND journal_entry_id = $2',
        [params.mediaId, params.entryId]
      );
      if (m.rows.length === 0) return;
      await deleteDriveFile(m.rows[0].drive_file_id);
      await c.query('DELETE FROM media WHERE id = $1', [params.mediaId]);
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Schritt 8: Backend bauen und deployen**

```bash
cd /c/Users/Jan/Git/reise-app
npm run build --prefix backend 2>&1 | tail -5
REISE_HOST=100.84.90.104 bash backend/deploy.sh
```
Erwartete Ausgabe: `Build: OK`, `Deploy: OK`

- [ ] **Schritt 9: Endpunkte manuell testen**

```bash
TOKEN=$(curl -s -X POST https://api.jan-toenhardt.de/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jan@toenhardt.de","password":"Jan74berlin"}' | jq -r .token)

# PUT testen
curl -s -X PUT https://api.jan-toenhardt.de/api/v1/trips/1e619bca-974f-4feb-a19d-001d51eea93e/journal/<ENTRY_ID> \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[{"type":"text","content":"Test"}]}'
```
Erwartete Ausgabe: JSON mit `blocks: [{"type":"text","content":"Test"}]`

- [ ] **Schritt 10: Commit**

```bash
git add backend/migrations/003_journal_blocks.sql backend/src/journal/router.ts
git commit -m "feat(backend): blocks JSONB column + PUT/DELETE journal endpoints"
```

---

## Task 2: PWA-Projekt aufsetzen

**Files:**
- Create: `pwa/package.json`
- Create: `pwa/vite.config.ts`
- Create: `pwa/tsconfig.json`
- Create: `pwa/index.html`
- Create: `pwa/src/main.tsx`
- Create: `pwa/src/types.ts`

- [ ] **Schritt 1: Vite-Projekt erstellen**

```bash
cd /c/Users/Jan/Git/reise-app
npm create vite@latest pwa -- --template react-ts
cd pwa
npm install
npm install react-router-dom sortablejs
npm install -D @types/sortablejs vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Schritt 2: vite.config.ts anpassen**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
  },
  server: {
    proxy: {
      '/api': 'https://api.jan-toenhardt.de',
      '/uploads': 'https://api.jan-toenhardt.de',
    },
  },
});
```

- [ ] **Schritt 3: Test-Setup erstellen**

Datei `pwa/src/__tests__/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Schritt 4: Shared TypeScript-Typen anlegen**

Datei `pwa/src/types.ts`:
```typescript
export interface User {
  id: string;
  email: string;
  display_name: string;
  role: 'owner' | 'member';
  family_id: string;
}

export interface Trip {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}

export interface Media {
  id: string;
  journal_entry_id: string;
  drive_file_id: string;
  drive_view_url: string;
  filename: string;
}

export type Block =
  | { type: 'text'; content: string }
  | { type: 'images'; media_ids: string[] };

export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id?: string;
  user_id: string;
  text?: string;
  blocks?: Block[];
  created_at: string;
  updated_at: string;
  media: Media[];
}
```

- [ ] **Schritt 5: package.json scripts prüfen**

In `pwa/package.json` sicherstellen:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Schritt 6: Dev-Server starten und prüfen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa
npm run dev
```
Browser öffnen: `http://localhost:5173` — Vite-Standardseite erscheint.

- [ ] **Schritt 7: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/
git commit -m "feat(pwa): Vite + React + TypeScript Grundgerüst"
```

---

## Task 3: API-Client + Auth-Kontext + Login-Seite

**Files:**
- Create: `pwa/src/api/client.ts`
- Create: `pwa/src/api/auth.ts`
- Create: `pwa/src/api/trips.ts`
- Create: `pwa/src/api/journal.ts`
- Create: `pwa/src/contexts/AuthContext.tsx`
- Create: `pwa/src/pages/LoginPage.tsx`
- Create: `pwa/src/__tests__/apiClient.test.ts`

- [ ] **Schritt 1: Test für API-Client schreiben**

Datei `pwa/src/__tests__/apiClient.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from '../api/client';

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends Authorization header when token in localStorage', async () => {
    localStorage.setItem('jwt', 'test-token');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/api/v1/health');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/health'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      })
    );
  });

  it('throws ApiError on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
    ));
    await expect(apiFetch('/api/v1/missing')).rejects.toThrow('Not found');
  });
});
```

- [ ] **Schritt 2: Test ausführen — muss fehlschlagen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa
npm test
```
Erwartete Ausgabe: `FAIL — apiFetch is not defined`

- [ ] **Schritt 3: API-Client implementieren**

Datei `pwa/src/api/client.ts`:
```typescript
const BASE = import.meta.env.VITE_API_BASE ?? 'https://api.jan-toenhardt.de';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('jwt');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
```

- [ ] **Schritt 4: Tests ausführen — müssen bestehen**

```bash
npm test
```
Erwartete Ausgabe: `PASS — 2 tests passed`

- [ ] **Schritt 5: auth.ts implementieren**

Datei `pwa/src/api/auth.ts`:
```typescript
import { apiFetch } from './client';
import type { User } from '../types';

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  return apiFetch('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<{ user: User }> {
  return apiFetch('/api/v1/auth/me');
}
```

- [ ] **Schritt 6: trips.ts implementieren**

Datei `pwa/src/api/trips.ts`:
```typescript
import { apiFetch } from './client';
import type { Trip } from '../types';

export async function getTrips(): Promise<{ trips: Trip[] }> {
  return apiFetch('/api/v1/trips');
}

export async function createTrip(data: { title: string; start_date?: string; end_date?: string }): Promise<{ trip: Trip }> {
  return apiFetch('/api/v1/trips', { method: 'POST', body: JSON.stringify(data) });
}
```

- [ ] **Schritt 7: journal.ts implementieren**

Datei `pwa/src/api/journal.ts`:
```typescript
import { apiFetch } from './client';
import type { JournalEntry, Block } from '../types';

export async function getEntries(tripId: string): Promise<{ entries: JournalEntry[] }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal`);
}

export async function createEntry(
  tripId: string,
  data: { text?: string; blocks?: Block[] }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  data: { text?: string; blocks?: Block[] }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEntry(tripId: string, entryId: string): Promise<void> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}`, { method: 'DELETE' });
}

export async function uploadMedia(
  tripId: string,
  entryId: string,
  file: File
): Promise<{ media: { id: string; drive_view_url: string } }> {
  const form = new FormData();
  form.append('photo', file);
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/media`, {
    method: 'POST',
    body: form,
  });
}

export async function deleteMedia(tripId: string, entryId: string, mediaId: string): Promise<void> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/media/${mediaId}`, { method: 'DELETE' });
}
```

- [ ] **Schritt 8: AuthContext implementieren**

Datei `pwa/src/contexts/AuthContext.tsx`:
```typescript
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types';
import { getMe } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getMe()
      .then(({ user }) => setUser(user))
      .catch(() => { localStorage.removeItem('jwt'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  function setAuth(t: string, u: User) {
    localStorage.setItem('jwt', t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem('jwt');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, setAuth, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Schritt 9: LoginPage implementieren**

Datei `pwa/src/pages/LoginPage.tsx`:
```typescript
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      setAuth(token, user);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 32 }}>🧭 Reisetagebuch</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="E-Mail" required
          style={{ padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Passwort" required
          style={{ padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
        />
        {error && <p style={{ color: '#c00', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '12px', fontSize: 16, borderRadius: 8, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {loading ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Schritt 10: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/api/ pwa/src/contexts/ pwa/src/pages/LoginPage.tsx pwa/src/__tests__/
git commit -m "feat(pwa): API-Client, Auth-Kontext und Login-Seite"
```

---

## Task 4: App-Routing + Mode-Kontext + Reisen-Liste

**Files:**
- Create: `pwa/src/contexts/ModeContext.tsx`
- Create: `pwa/src/components/ModeToggle.tsx`
- Create: `pwa/src/pages/TripsPage.tsx`
- Modify: `pwa/src/App.tsx`
- Modify: `pwa/src/main.tsx`

- [ ] **Schritt 1: ModeContext implementieren**

Datei `pwa/src/contexts/ModeContext.tsx`:
```typescript
import { createContext, useContext, useState, ReactNode } from 'react';

type Mode = 'mobile' | 'desktop';

interface ModeState {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeState>(null!);

function detectMode(): Mode {
  const saved = localStorage.getItem('pwa_mode') as Mode | null;
  if (saved) return saved;
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(detectMode);

  function setMode(m: Mode) {
    localStorage.setItem('pwa_mode', m);
    setModeState(m);
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
```

- [ ] **Schritt 2: ModeToggle implementieren**

Datei `pwa/src/components/ModeToggle.tsx`:
```typescript
import { useMode } from '../contexts/ModeContext';

export default function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        onClick={() => setMode('mobile')}
        title="Handy-Modus"
        style={{
          padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: mode === 'mobile' ? '#4a90e2' : '#eee',
          color: mode === 'mobile' ? '#fff' : '#666',
          fontSize: 16,
        }}>📱</button>
      <button
        onClick={() => setMode('desktop')}
        title="Desktop-Modus"
        style={{
          padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: mode === 'desktop' ? '#4a90e2' : '#eee',
          color: mode === 'desktop' ? '#fff' : '#666',
          fontSize: 16,
        }}>🖥</button>
    </div>
  );
}
```

- [ ] **Schritt 3: TripsPage implementieren**

Datei `pwa/src/pages/TripsPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrips, createTrip } from '../api/trips';
import { useAuth } from '../contexts/AuthContext';
import ModeToggle from '../components/ModeToggle';
import type { Trip } from '../types';

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    getTrips().then(({ trips }) => setTrips(trips)).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const { trip } = await createTrip({ title: newTitle.trim() });
    setTrips(t => [...t, trip]);
    setNewTitle('');
    setShowForm(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🧭 Meine Reisen</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ModeToggle />
          <button onClick={logout} style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      {loading ? <p>Lade…</p> : trips.map(t => (
        <div key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
          style={{ background: '#f5f7fa', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', borderLeft: '4px solid #4a90e2' }}>
          <div style={{ fontWeight: 600 }}>{t.title}</div>
          {t.start_date && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.start_date} – {t.end_date ?? '?'}</div>}
        </div>
      ))}

      {showForm ? (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Reisetitel" autoFocus
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }} />
          <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer' }}>OK</button>
          <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>✕</button>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, border: '2px dashed #4a90e2', background: '#f0f6ff', color: '#4a90e2', cursor: 'pointer', fontSize: 14, width: '100%' }}>
          + Neue Reise
        </button>
      )}
    </div>
  );
}
```

- [ ] **Schritt 4: App.tsx mit Routing aufsetzen**

Datei `pwa/src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import LoginPage from './pages/LoginPage';
import TripsPage from './pages/TripsPage';
import TripPage from './pages/TripPage';
import JournalEntryPage from './pages/JournalEntryPage';
import JournalEntryViewPage from './pages/JournalEntryViewPage';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 32 }}>Lade…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ModeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Guard><TripsPage /></Guard>} />
            <Route path="/trips/:tripId" element={<Guard><TripPage /></Guard>} />
            <Route path="/trips/:tripId/journal/:entryId" element={<Guard><JournalEntryPage /></Guard>} />
            <Route path="/trips/:tripId/journal/:entryId/view" element={<Guard><JournalEntryViewPage /></Guard>} />
          </Routes>
        </BrowserRouter>
      </ModeProvider>
    </AuthProvider>
  );
}
```

- [ ] **Schritt 5: main.tsx anpassen**

Datei `pwa/src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Schritt 6: Dev-Server testen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa && npm run dev
```
Browser: `http://localhost:5173` → weiterleitung auf `/login` → Login mit `jan@toenhardt.de / Jan74berlin` → Reisenliste erscheint mit „Baltikum 2026".

- [ ] **Schritt 7: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/
git commit -m "feat(pwa): Routing, Mode-Kontext, ModeToggle und Reisen-Liste"
```

---

## Task 5: Trip-Seite (Tages-Liste)

**Files:**
- Create: `pwa/src/pages/TripPage.tsx`

- [ ] **Schritt 1: TripPage implementieren**

Datei `pwa/src/pages/TripPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrips } from '../api/trips';
import { getEntries, createEntry } from '../api/journal';
import ModeToggle from '../components/ModeToggle';
import type { Trip, JournalEntry } from '../types';

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTrips(), getEntries(tripId!)]).then(([{ trips }, { entries }]) => {
      setTrip(trips.find(t => t.id === tripId) ?? null);
      setEntries(entries);
    }).finally(() => setLoading(false));
  }, [tripId]);

  async function handleNewEntry() {
    const { entry } = await createEntry(tripId!, { blocks: [] });
    navigate(`/trips/${tripId}/journal/${entry.id}`);
  }

  function getThumbnail(entry: JournalEntry): string | null {
    const firstImgBlock = entry.blocks?.find(b => b.type === 'images');
    if (firstImgBlock && firstImgBlock.type === 'images' && firstImgBlock.media_ids.length > 0) {
      const media = entry.media.find(m => m.id === firstImgBlock.media_ids[0]);
      return media?.drive_view_url ?? null;
    }
    return entry.media[0]?.drive_view_url ?? null;
  }

  function getPhotoCount(entry: JournalEntry): number {
    return entry.media.length;
  }

  if (loading) return <div style={{ padding: 32 }}>Lade…</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
          <h1 style={{ margin: 0, fontSize: 18 }}>{trip?.title ?? 'Reise'}</h1>
        </div>
        <ModeToggle />
      </div>

      {entries.map((entry, i) => {
        const thumb = getThumbnail(entry);
        const photoCount = getPhotoCount(entry);
        const date = new Date(entry.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
        return (
          <div key={entry.id} onClick={() => navigate(`/trips/${tripId}/journal/${entry.id}`)}
            style={{ background: '#f5f7fa', borderRadius: 10, padding: '12px 14px', marginBottom: 10, cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }}>
            {thumb
              ? <img src={thumb} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
              : <div style={{ width: 64, height: 48, background: '#dde3ec', borderRadius: 6, flexShrink: 0 }} />}
            <div>
              <div style={{ fontWeight: 600 }}>Tag {i + 1} · {date}</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{photoCount} {photoCount === 1 ? 'Foto' : 'Fotos'}</div>
            </div>
          </div>
        );
      })}

      <button onClick={handleNewEntry}
        style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, border: '2px dashed #4a90e2', background: '#f0f6ff', color: '#4a90e2', cursor: 'pointer', fontSize: 14, width: '100%' }}>
        + Neuer Tag
      </button>
    </div>
  );
}
```

- [ ] **Schritt 2: Testen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa && npm run dev
```
Login → Reise „Baltikum 2026" anklicken → Tages-Liste erscheint → „+ Neuer Tag" erstellt Eintrag und leitet weiter.

- [ ] **Schritt 3: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/pages/TripPage.tsx
git commit -m "feat(pwa): Tages-Liste (TripPage)"
```

---

## Task 6: resizeImage-Utility + PhotoUpload-Komponente

**Files:**
- Create: `pwa/src/utils/resizeImage.ts`
- Create: `pwa/src/__tests__/resizeImage.test.ts`
- Create: `pwa/src/components/PhotoUpload.tsx`

- [ ] **Schritt 1: Test für resizeImage schreiben**

Datei `pwa/src/__tests__/resizeImage.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { resizeImage } from '../utils/resizeImage';

describe('resizeImage', () => {
  it('returns a File with JPEG mime type', async () => {
    // Mock Canvas API
    const mockCtx = { drawImage: vi.fn() };
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob([''], { type: 'image/jpeg' }))),
      width: 0,
      height: 0,
    };
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(mockCanvas),
    });

    const mockImg = { onload: null as null | (() => void), src: '', naturalWidth: 2000, naturalHeight: 1500 };
    vi.stubGlobal('Image', vi.fn().mockImplementation(() => {
      setTimeout(() => mockImg.onload?.(), 0);
      return mockImg;
    }));

    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    const result = await resizeImage(file, 1280);
    expect(result.type).toBe('image/jpeg');
    expect(mockCanvas.width).toBe(1280);
    expect(mockCanvas.height).toBe(960);
  });
});
```

- [ ] **Schritt 2: Test ausführen — muss fehlschlagen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa && npm test
```
Erwartete Ausgabe: `FAIL — resizeImage is not defined`

- [ ] **Schritt 3: resizeImage implementieren**

Datei `pwa/src/utils/resizeImage.ts`:
```typescript
export function resizeImage(file: File, maxWidth = 1280, quality = 0.85): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxWidth / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('toBlob failed')); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
```

- [ ] **Schritt 4: Tests ausführen — müssen bestehen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa && npm test
```
Erwartete Ausgabe: `PASS — 3 tests passed`

- [ ] **Schritt 5: PhotoUpload-Komponente implementieren**

Datei `pwa/src/components/PhotoUpload.tsx`:
```typescript
import { useRef, useState } from 'react';
import { resizeImage } from '../utils/resizeImage';
import { uploadMedia } from '../api/journal';

interface Props {
  tripId: string;
  entryId: string;
  onUploaded: (mediaId: string, url: string) => void;
}

interface UploadState {
  name: string;
  progress: 'resizing' | 'uploading' | 'done' | 'error';
}

export default function PhotoUpload({ tripId, entryId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [states, setStates] = useState<UploadState[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  async function handleFiles(files: FileList) {
    const arr = Array.from(files);
    setStates(arr.map(f => ({ name: f.name, progress: 'resizing' })));
    setPreviews(arr.map(f => URL.createObjectURL(f)));

    for (let i = 0; i < arr.length; i++) {
      try {
        setStates(s => s.map((x, j) => j === i ? { ...x, progress: 'resizing' } : x));
        const resized = await resizeImage(arr[i]);
        setStates(s => s.map((x, j) => j === i ? { ...x, progress: 'uploading' } : x));
        const { media } = await uploadMedia(tripId, entryId, resized);
        onUploaded(media.id, media.drive_view_url);
        setStates(s => s.map((x, j) => j === i ? { ...x, progress: 'done' } : x));
      } catch {
        setStates(s => s.map((x, j) => j === i ? { ...x, progress: 'error' } : x));
      }
    }
  }

  const progressLabel = { resizing: '⏳', uploading: '⬆', done: '✓', error: '✕' };

  return (
    <div>
      <input
        ref={inputRef} type="file" multiple accept="image/*"
        style={{ display: 'none' }}
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #4a90e2', borderRadius: 12, padding: '28px 20px',
          textAlign: 'center', background: '#f0f6ff', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 36 }}>📷</div>
        <div style={{ fontWeight: 600, marginTop: 8 }}>Fotos auswählen</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Galerie öffnen · mehrere wählbar · werden auf 1280px verkleinert</div>
      </div>

      {previews.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {previews.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={url} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{
                position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.6)',
                color: '#fff', borderRadius: 4, padding: '1px 4px', fontSize: 11,
              }}>
                {progressLabel[states[i]?.progress ?? 'resizing']}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Schritt 6: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/utils/ pwa/src/components/PhotoUpload.tsx pwa/src/__tests__/resizeImage.test.ts
git commit -m "feat(pwa): resizeImage-Utility und PhotoUpload-Komponente"
```

---

## Task 7: JournalEntryPage — beide Modi

**Files:**
- Create: `pwa/src/pages/JournalEntryPage.tsx`

- [ ] **Schritt 1: JournalEntryPage implementieren**

Datei `pwa/src/pages/JournalEntryPage.tsx`:
```typescript
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sortable from 'sortablejs';
import { getEntries, updateEntry, uploadMedia, deleteMedia } from '../api/journal';
import { useMode } from '../contexts/ModeContext';
import ModeToggle from '../components/ModeToggle';
import PhotoUpload from '../components/PhotoUpload';
import type { JournalEntry, Block } from '../types';

export default function JournalEntryPage() {
  const { tripId, entryId } = useParams<{ tripId: string; entryId: string }>();
  const navigate = useNavigate();
  const { mode } = useMode();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getEntries(tripId!).then(({ entries }) => {
      const e = entries.find(x => x.id === entryId);
      if (e) { setEntry(e); setBlocks(e.blocks ?? []); }
    });
  }, [tripId, entryId]);

  // SortableJS nur im Desktop-Modus
  useEffect(() => {
    if (mode !== 'desktop' || !blocksRef.current) return;
    const sortable = Sortable.create(blocksRef.current, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: (evt) => {
        setBlocks(prev => {
          const next = [...prev];
          const [moved] = next.splice(evt.oldIndex!, 1);
          next.splice(evt.newIndex!, 0, moved);
          return next;
        });
      },
    });
    return () => sortable.destroy();
  }, [mode, blocks.length]);

  async function save() {
    if (!tripId || !entryId) return;
    setSaving(true);
    try {
      await updateEntry(tripId, entryId, { blocks });
    } finally {
      setSaving(false);
    }
  }

  function addTextBlock() {
    setBlocks(b => [...b, { type: 'text', content: '' }]);
  }

  function addImageBlock() {
    setBlocks(b => [...b, { type: 'images', media_ids: [] }]);
  }

  function updateTextBlock(i: number, content: string) {
    setBlocks(b => b.map((block, j) => j === i ? { ...block, type: 'text', content } as Block : block));
  }

  function removeBlock(i: number) {
    setBlocks(b => b.filter((_, j) => j !== i));
  }

  function moveBlock(i: number, dir: -1 | 1) {
    setBlocks(b => {
      const next = [...b];
      const target = i + dir;
      if (target < 0 || target >= next.length) return next;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  function onMediaUploaded(blockIndex: number, mediaId: string) {
    setBlocks(b => b.map((block, j) => {
      if (j !== blockIndex || block.type !== 'images') return block;
      return { type: 'images', media_ids: [...block.media_ids, mediaId] };
    }));
  }

  function onMobileUploaded(mediaId: string) {
    // setBlocks callback-Form: newBlocks ist der aktuelle Stand nach dem Update
    // → direkt speichern, um den React-Closure-Bug zu vermeiden
    setBlocks(prevBlocks => {
      const lastImgIdx = [...prevBlocks].map((b, i) => b.type === 'images' ? i : -1).filter(i => i >= 0).pop();
      const newBlocks: Block[] = lastImgIdx !== undefined
        ? prevBlocks.map((block, j) => {
            if (j !== lastImgIdx || block.type !== 'images') return block;
            return { type: 'images', media_ids: [...block.media_ids, mediaId] };
          })
        : [...prevBlocks, { type: 'images', media_ids: [mediaId] }];
      updateEntry(tripId!, entryId!, { blocks: newBlocks }).catch(() => {});
      return newBlocks;
    });
  }

  if (!entry) return <div style={{ padding: 32 }}>Lade…</div>;

  // ── HANDY-MODUS ──────────────────────────────────────────────────────
  if (mode === 'mobile') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => navigate(`/trips/${tripId}`)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
            <h1 style={{ margin: 0, fontSize: 18 }}>Fotos hochladen</h1>
          </div>
          <ModeToggle />
        </div>

        <PhotoUpload
          tripId={tripId!}
          entryId={entryId!}
          onUploaded={(id) => onMobileUploaded(id)}
        />

        <button
          onClick={() => navigate(`/trips/${tripId}/journal/${entryId}/view`)}
          style={{ marginTop: 20, width: '100%', padding: 12, borderRadius: 8, background: '#f5f7fa', border: '1px solid #ddd', cursor: 'pointer', fontSize: 14 }}>
          Eintrag ansehen →
        </button>
      </div>
    );
  }

  // ── DESKTOP-MODUS ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 180, borderRight: '1px solid #e0e0e0', padding: 12, overflowY: 'auto', flexShrink: 0 }}>
        <button onClick={() => navigate(`/trips/${tripId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#4a90e2', marginBottom: 12 }}>← Zurück</button>
        <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>BLÖCKE</div>
        <div style={{ fontSize: 13, color: '#555' }}>{blocks.length} Block{blocks.length !== 1 ? 'e' : ''}</div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>
            {new Date(entry.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <ModeToggle />
            <button onClick={() => navigate(`/trips/${tripId}/journal/${entryId}/view`)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
              👁 Ansehen
            </button>
            <button onClick={save} disabled={saving}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Speichere…' : '💾 Speichern'}
            </button>
          </div>
        </div>

        <div ref={blocksRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocks.map((block, i) => (
            <div key={i} data-index={i}
              style={{ background: block.type === 'text' ? '#e8f0fe' : '#f0f8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className="drag-handle" style={{ cursor: 'grab', color: '#bbb', fontSize: 18, userSelect: 'none', flexShrink: 0 }}>⠿</span>

              <div style={{ flex: 1 }}>
                {block.type === 'text' ? (
                  <textarea
                    value={block.content}
                    onChange={e => updateTextBlock(i, e.target.value)}
                    placeholder="Text eingeben…"
                    style={{ width: '100%', minHeight: 80, border: 'none', background: 'transparent', resize: 'vertical', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {block.media_ids.map(id => {
                        const media = entry.media.find(m => m.id === id);
                        return media ? (
                          <div key={id} style={{ position: 'relative' }}>
                            <img src={media.drive_view_url} alt="" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                            <button
                              onClick={async () => {
                                await deleteMedia(tripId!, entryId!, id);
                                setBlocks(b => b.map((bl, j) => j !== i || bl.type !== 'images' ? bl
                                  : { type: 'images', media_ids: bl.media_ids.filter(x => x !== id) }));
                              }}
                              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              ✕
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <PhotoUpload
                      tripId={tripId!}
                      entryId={entryId!}
                      onUploaded={(id) => onMediaUploaded(i, id)}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                <button onClick={() => moveBlock(i, -1)} style={btnStyle}>▲</button>
                <button onClick={() => moveBlock(i, 1)} style={btnStyle}>▼</button>
                <button onClick={() => removeBlock(i)} style={{ ...btnStyle, color: '#c00' }}>✕</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={addTextBlock} style={addBtnStyle}>+ Text</button>
          <button onClick={addImageBlock} style={addBtnStyle}>+ Fotos</button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer',
};
const addBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px dashed #aaa', background: '#f9f9f9', cursor: 'pointer', fontSize: 14,
};
```

- [ ] **Schritt 2: Testen**

Dev-Server starten, Reise öffnen, „+ Neuer Tag" → JournalEntryPage. Im Handy-Modus: Foto auswählen, wird hochgeladen und angezeigt. Desktop-Modus umschalten: Blöcke erscheinen, Drag & Drop funktioniert, Speichern-Button sendet PUT.

- [ ] **Schritt 3: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/pages/JournalEntryPage.tsx
git commit -m "feat(pwa): JournalEntryPage mit Handy- und Desktop-Modus"
```

---

## Task 8: Leseansicht + Lightbox

**Files:**
- Create: `pwa/src/components/Lightbox.tsx`
- Create: `pwa/src/pages/JournalEntryViewPage.tsx`

- [ ] **Schritt 1: Lightbox implementieren**

Datei `pwa/src/components/Lightbox.tsx`:
```typescript
import { useEffect } from 'react';

interface Props {
  src: string;
  onClose: () => void;
}

export default function Lightbox({ src, onClose }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <img
        src={src} alt=""
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 6 }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)',
          color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40,
          fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
    </div>
  );
}
```

- [ ] **Schritt 2: JournalEntryViewPage implementieren**

Datei `pwa/src/pages/JournalEntryViewPage.tsx`:
```typescript
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEntries } from '../api/journal';
import Lightbox from '../components/Lightbox';
import type { JournalEntry, Block } from '../types';

export default function JournalEntryViewPage() {
  const { tripId, entryId } = useParams<{ tripId: string; entryId: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    getEntries(tripId!).then(({ entries }) => {
      setEntry(entries.find(e => e.id === entryId) ?? null);
    });
  }, [tripId, entryId]);

  if (!entry) return <div style={{ padding: 32 }}>Lade…</div>;

  const blocks: Block[] = entry.blocks?.length
    ? entry.blocks
    : entry.text
    ? [{ type: 'text', content: entry.text }]
    : [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={() => navigate(`/trips/${tripId}`)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
        <h2 style={{ margin: 0 }}>
          {new Date(entry.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        <button onClick={() => navigate(`/trips/${tripId}/journal/${entryId}`)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          ✏️ Bearbeiten
        </button>
      </div>

      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color: '#333', marginBottom: 20, whiteSpace: 'pre-wrap' }}>
              {block.content}
            </p>
          );
        }
        const images = block.media_ids
          .map(id => entry.media.find(m => m.id === id))
          .filter(Boolean);
        return (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {images.map(media => (
              <img
                key={media!.id}
                src={media!.drive_view_url}
                alt=""
                onClick={() => setLightbox(media!.drive_view_url)}
                style={{ height: 180, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flex: '1 1 200px', maxWidth: '100%' }}
              />
            ))}
          </div>
        );
      })}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
```

- [ ] **Schritt 3: Testen**

Eintrag aufrufen → „Eintrag ansehen" → Texte und Bilder erscheinen. Bild antippen → Lightbox öffnet sich. Klick außen oder ESC schließt die Lightbox.

- [ ] **Schritt 4: Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/src/components/Lightbox.tsx pwa/src/pages/JournalEntryViewPage.tsx
git commit -m "feat(pwa): Leseansicht mit Lightbox"
```

---

## Task 9: PWA-Manifest + Deployment

**Files:**
- Create: `pwa/public/manifest.json`
- Modify: `pwa/index.html`

- [ ] **Schritt 1: PWA-Manifest erstellen**

Datei `pwa/public/manifest.json`:
```json
{
  "name": "Reisetagebuch",
  "short_name": "Tagebuch",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4a90e2",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Schritt 2: index.html anpassen**

In `pwa/index.html` im `<head>` ergänzen:
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#4a90e2">
<link rel="manifest" href="/manifest.json">
<title>Reisetagebuch</title>
```

- [ ] **Schritt 3: Placeholder-Icons erstellen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa/public
# Minimale PNG-Icons (kannst du später durch echte ersetzen)
node -e "
const {createCanvas} = require('canvas');
[192, 512].forEach(s => {
  const c = createCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a90e2';
  ctx.fillRect(0,0,s,s);
  ctx.fillStyle = '#fff';
  ctx.font = \`bold \${s/3}px sans-serif\`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧭', s/2, s/2);
  require('fs').writeFileSync('icon-'+s+'.png', c.toBuffer());
});
" 2>/dev/null || echo "Canvas nicht verfügbar — Icons manuell hinzufügen"
```

Falls `canvas` nicht verfügbar: zwei beliebige 192×192 und 512×512 PNG-Dateien als `icon-192.png` und `icon-512.png` in `pwa/public/` ablegen.

- [ ] **Schritt 4: Build erstellen**

```bash
cd /c/Users/Jan/Git/reise-app/pwa
npm run build
```
Erwartete Ausgabe: `dist/` mit `index.html`, `assets/`, `manifest.json`

- [ ] **Schritt 5: Auf LXC 111 deployen**

```bash
# Verzeichnis auf LXC anlegen
ssh root@100.84.90.104 "mkdir -p /var/www/tagebuch"

# Dateien übertragen
cd /c/Users/Jan/Git/reise-app/pwa
tar czf - dist/ | ssh root@100.84.90.104 "cd /var/www/tagebuch && tar xzf - --strip-components=1"
```

- [ ] **Schritt 6: Nginx-Config auf LXC 111 einrichten**

```bash
ssh root@100.84.90.104 "cat > /etc/nginx/sites-available/tagebuch << 'EOF'
server {
    listen 80;
    server_name tagebuch.jan-toenhardt.de;
    root /var/www/tagebuch;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
ln -sf /etc/nginx/sites-available/tagebuch /etc/nginx/sites-enabled/tagebuch
nginx -t && systemctl reload nginx"
```

- [ ] **Schritt 7: Cloudflare Tunnel konfigurieren**

```bash
ssh root@100.84.90.104 "cat /etc/cloudflared/config.yml"
```
Den bestehenden `config.yml` um einen neuen Eintrag ergänzen:
```yaml
- hostname: tagebuch.jan-toenhardt.de
  service: http://localhost:80
```
```bash
ssh root@100.84.90.104 "systemctl restart cloudflared"
```

- [ ] **Schritt 8: Live testen**

Browser: `https://tagebuch.jan-toenhardt.de` → Login-Seite erscheint → Login funktioniert → Reisen sichtbar.

Auf Handy: URL öffnen → „Zum Homescreen hinzufügen" → App-Icon erscheint → standalone-Modus beim Öffnen.

- [ ] **Schritt 9: Finaler Commit**

```bash
cd /c/Users/Jan/Git/reise-app
git add pwa/public/manifest.json pwa/index.html
git commit -m "feat(pwa): PWA-Manifest und Deployment-Konfiguration"
```

---

## Alle Tests ausführen

```bash
cd /c/Users/Jan/Git/reise-app

# Backend
npm test --prefix backend
# Erwartete Ausgabe: alle bestehenden Tests grün

# PWA
npm test --prefix pwa
# Erwartete Ausgabe: 3 Tests grün (apiClient x2, resizeImage x1)
```
