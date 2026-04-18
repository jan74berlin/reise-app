# Sub-Projekt 2: Trip-Verwaltung in PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jahres-gruppierte Trip-Liste, erweitertes Trip-Erstell-Formular, editierbare Trip-Beschreibung und Pflicht-Datum auf Tagesseiten in der Reise-App-PWA.

**Architecture:** Kleine Migration `005` fügt `date` auf `journal_entries` hinzu. Backend-Router (`journal/router.ts`) wird um `date` in POST/PUT und Sortierung `date ASC NULLS LAST, created_at ASC` in GET erweitert. PWA bekommt eine wiederverwendbare `InlineEditText`-Komponente, erweitertes Formular auf `TripsPage`, Header mit Beschreibung auf `TripPage`, Pflicht-Datum beim Anlegen und editierbares Datum auf Entry-Seiten.

**Tech Stack:** Node.js/TypeScript + Express + PostgreSQL (Backend), Vitest + supertest (Tests), React + TypeScript + Vite (PWA), `fetch` + JWT (API-Client).

**Spec:** [docs/superpowers/specs/2026-04-18-trip-verwaltung-pwa-design.md](../specs/2026-04-18-trip-verwaltung-pwa-design.md)

---

## File Structure

**Create:**
- `backend/migrations/005_journal_entry_date.sql` — Migration
- `pwa/src/components/InlineEditText.tsx` — wiederverwendbare Edit-Komponente

**Modify:**
- `backend/src/journal/router.ts` — POST/PUT/`GET` um `date` erweitern
- `backend/src/journal/journal.test.ts` — neue Tests
- `pwa/src/types.ts` — `JournalEntry.date`, `Trip` schon ok
- `pwa/src/api/journal.ts` — `date` in `createEntry`/`updateEntry`
- `pwa/src/api/trips.ts` — `updateTrip` ergänzen, `description` in `createTrip`
- `pwa/src/pages/TripsPage.tsx` — Jahres-Gruppierung + erweitertes Formular
- `pwa/src/pages/TripPage.tsx` — Beschreibung + Datum-Header + Tag-Anlegen mit Datum
- `pwa/src/pages/JournalEntryPage.tsx` — Datum editierbar
- `pwa/src/pages/JournalEntryViewPage.tsx` — Datum anzeigen

---

## Task 1: Migration 005 — `date`-Spalte auf `journal_entries`

**Files:**
- Create: `backend/migrations/005_journal_entry_date.sql`

- [ ] **Step 1: Migration schreiben**

Datei `backend/migrations/005_journal_entry_date.sql`:

```sql
ALTER TABLE journal_entries ADD COLUMN date DATE;
```

- [ ] **Step 2: Migration in lokaler Test-DB anwenden**

Run:
```bash
cd backend
psql "$DATABASE_URL" -f migrations/005_journal_entry_date.sql
```
Expected: `ALTER TABLE`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/005_journal_entry_date.sql
git commit -m "feat(db): migration 005 adds journal_entries.date"
```

---

## Task 2: Backend — `POST /journal` akzeptiert `date`

**Files:**
- Modify: `backend/src/journal/router.ts:40-54`
- Test: `backend/src/journal/journal.test.ts`

- [ ] **Step 1: Failing test schreiben**

Am Ende von `describe('Journal entries CRUD', ...)` in `backend/src/journal/journal.test.ts` ergänzen:

```typescript
it('POST /journal — persists date field', async () => {
  const res = await request(app)
    .post(`/api/v1/trips/${tripId}/journal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Mit Datum', date: '2026-06-10' });
  expect(res.status).toBe(201);
  expect(res.body.entry.date).toBe('2026-06-10');
});

it('POST /journal — date can be omitted (null)', async () => {
  const res = await request(app)
    .post(`/api/v1/trips/${tripId}/journal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Ohne Datum' });
  expect(res.status).toBe(201);
  expect(res.body.entry.date).toBeNull();
});
```

- [ ] **Step 2: Test laufen, fail verifizieren**

Run:
```bash
cd backend
npm test -- journal
```
Expected: neue Tests FAIL (`date` ist undefined).

- [ ] **Step 3: Router anpassen**

In `backend/src/journal/router.ts` die POST-Route (Zeile 40-54) ersetzen durch:

```typescript
journalRouter.post('/', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, night_id, blocks, date } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        'INSERT INTO journal_entries (trip_id, night_id, user_id, text, blocks, date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [params.tripId, night_id ?? null, req.user.userId, text ?? null, blocks ?? null, date ?? null]
      )
    );
    res.status(201).json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4: Tests laufen, pass verifizieren**

Run:
```bash
npm test -- journal
```
Expected: alle PASS. Hinweis: `res.body.entry.date` kommt als ISO-String `"2026-06-10"` aus pg (DATE-Typ wird als String serialisiert, kein Timezone-Suffix).

- [ ] **Step 5: Commit**

```bash
git add backend/src/journal/router.ts backend/src/journal/journal.test.ts
git commit -m "feat(journal): POST accepts optional date field"
```

---

## Task 3: Backend — `PUT /journal/:id` akzeptiert `date`

**Files:**
- Modify: `backend/src/journal/router.ts:56-76`
- Test: `backend/src/journal/journal.test.ts`

- [ ] **Step 1: Failing test schreiben**

In `journal.test.ts` ergänzen:

```typescript
it('PUT /journal/:id — updates date', async () => {
  const create = await request(app)
    .post(`/api/v1/trips/${tripId}/journal`)
    .set('Authorization', `Bearer ${token}`)
    .send({ text: 'Startdatum' , date: '2026-06-01' });
  const id = create.body.entry.id;

  const upd = await request(app)
    .put(`/api/v1/trips/${tripId}/journal/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ date: '2026-06-15' });
  expect(upd.status).toBe(200);
  expect(upd.body.entry.date).toBe('2026-06-15');
});
```

- [ ] **Step 2: Test laufen, fail verifizieren**

Run: `npm test -- journal`
Expected: neuer Test FAIL (`date` bleibt unverändert).

- [ ] **Step 3: Router anpassen**

In `backend/src/journal/router.ts` die PUT-Route (Zeile 56-76) ersetzen durch:

```typescript
journalRouter.put('/:entryId', async (req, res) => {
  const params = req.params as Record<string, string>;
  const { text, blocks, date } = req.body;
  try {
    const r = await withFamily(req.user.familyId, (c) =>
      c.query(
        `UPDATE journal_entries
         SET text = COALESCE($1, text),
             blocks = COALESCE($2::jsonb, blocks),
             date = COALESCE($3::date, date),
             updated_at = now()
         WHERE id = $4 AND trip_id = $5
         RETURNING *`,
        [text ?? null, blocks ?? null, date ?? null, params.entryId, params.tripId]
      )
    );
    if (r.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ entry: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4: Tests laufen, pass verifizieren**

Run: `npm test -- journal`
Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/journal/router.ts backend/src/journal/journal.test.ts
git commit -m "feat(journal): PUT accepts date update"
```

---

## Task 4: Backend — `GET /journal` sortiert `date ASC NULLS LAST, created_at ASC`

**Files:**
- Modify: `backend/src/journal/router.ts:20-38`
- Test: `backend/src/journal/journal.test.ts`

- [ ] **Step 1: Failing test schreiben**

In `journal.test.ts` ergänzen:

```typescript
it('GET /journal — sorts by date ASC NULLS LAST, then created_at', async () => {
  const tRes = await request(app)
    .post('/api/v1/trips')
    .set('Authorization', `Bearer ${token}`)
    .send({ title: 'Sort Trip' });
  const sortTripId = tRes.body.trip.id;

  async function mk(text: string, date: string | null) {
    const r = await request(app)
      .post(`/api/v1/trips/${sortTripId}/journal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text, date });
    return r.body.entry.id;
  }
  const idB = await mk('B', '2026-06-10');
  const idA = await mk('A', '2026-06-05');
  const idNull = await mk('NULL', null);
  const idC = await mk('C', '2026-06-15');

  const res = await request(app)
    .get(`/api/v1/trips/${sortTripId}/journal`)
    .set('Authorization', `Bearer ${token}`);
  const ids = res.body.entries.map((e: { id: string }) => e.id);
  expect(ids).toEqual([idA, idB, idC, idNull]);
});
```

- [ ] **Step 2: Test laufen, fail verifizieren**

Run: `npm test -- journal`
Expected: FAIL (aktuelle Sortierung ist `created_at`, liefert Insert-Reihenfolge B,A,NULL,C).

- [ ] **Step 3: GET-Route anpassen**

In `backend/src/journal/router.ts` Zeile 24-27, Query ersetzen durch:

```typescript
const entries = await c.query(
  'SELECT * FROM journal_entries WHERE trip_id = $1 ORDER BY date ASC NULLS LAST, created_at ASC',
  [params.tripId]
);
```

- [ ] **Step 4: Tests laufen, pass verifizieren**

Run: `npm test -- journal`
Expected: alle PASS (35+ Tests grün).

- [ ] **Step 5: Commit**

```bash
git add backend/src/journal/router.ts backend/src/journal/journal.test.ts
git commit -m "feat(journal): GET orders by date ASC NULLS LAST, created_at ASC"
```

---

## Task 5: PWA types + API-Client für `date` und `updateTrip`

**Files:**
- Modify: `pwa/src/types.ts`
- Modify: `pwa/src/api/journal.ts`
- Modify: `pwa/src/api/trips.ts`

- [ ] **Step 1: Types erweitern**

In `pwa/src/types.ts` das Interface `JournalEntry` ergänzen (vor `media: Media[]`):

```typescript
export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id?: string;
  user_id: string;
  text?: string;
  blocks?: Block[];
  date?: string;        // NEW: YYYY-MM-DD
  created_at: string;
  updated_at: string;
  media: Media[];
}
```

- [ ] **Step 2: `journal.ts` API-Client erweitern**

In `pwa/src/api/journal.ts` die Funktionen `createEntry` und `updateEntry` durch folgende Versionen ersetzen:

```typescript
export async function createEntry(
  tripId: string,
  data: { text?: string; blocks?: Block[]; date?: string }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEntry(
  tripId: string,
  entryId: string,
  data: { text?: string; blocks?: Block[]; date?: string }
): Promise<{ entry: JournalEntry }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 3: `trips.ts` API-Client erweitern**

Datei `pwa/src/api/trips.ts` komplett ersetzen durch:

```typescript
import { apiFetch } from './client';
import type { Trip } from '../types';

export async function getTrips(): Promise<{ trips: Trip[] }> {
  return apiFetch('/api/v1/trips');
}

export async function createTrip(data: {
  title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}): Promise<{ trip: Trip }> {
  return apiFetch('/api/v1/trips', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTrip(
  tripId: string,
  data: { title?: string; start_date?: string; end_date?: string; description?: string }
): Promise<{ trip: Trip }> {
  return apiFetch(`/api/v1/trips/${tripId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 4: TypeScript-Build prüfen**

Run:
```bash
cd pwa
npx tsc --noEmit
```
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add pwa/src/types.ts pwa/src/api/journal.ts pwa/src/api/trips.ts
git commit -m "feat(pwa): api clients support date + updateTrip"
```

---

## Task 6: PWA — `InlineEditText`-Komponente

**Files:**
- Create: `pwa/src/components/InlineEditText.tsx`

- [ ] **Step 1: Komponente schreiben**

Datei `pwa/src/components/InlineEditText.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  inputType?: 'text' | 'date';
}

export default function InlineEditText({ value, placeholder, onSave, multiline, inputType = 'text' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const isEmpty = !value;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, color: isEmpty ? '#aaa' : '#333', whiteSpace: 'pre-wrap' }}>
          {isEmpty ? (placeholder ?? '') : value}
        </div>
        <button
          onClick={startEdit}
          aria-label="Bearbeiten"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}
        >
          ✏️
        </button>
      </div>
    );
  }

  const InputEl = multiline ? 'textarea' : 'input';
  return (
    <div>
      <InputEl
        type={multiline ? undefined : inputType}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value)}
        autoFocus
        rows={multiline ? 3 : undefined}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
      {error && <div style={{ color: '#c33', fontSize: 12, marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#4a90e2', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Speichere…' : 'Speichern'}
        </button>
        <button
          onClick={() => { setEditing(false); setError(null); }}
          disabled={saving}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add pwa/src/components/InlineEditText.tsx
git commit -m "feat(pwa): add InlineEditText component"
```

---

## Task 7: PWA `TripsPage` — Jahres-Gruppierung + erweitertes Formular

**Files:**
- Modify: `pwa/src/pages/TripsPage.tsx`

- [ ] **Step 1: TripsPage komplett ersetzen**

Datei `pwa/src/pages/TripsPage.tsx` komplett ersetzen durch:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrips, createTrip } from '../api/trips';
import { useAuth } from '../contexts/AuthContext';
import ModeToggle from '../components/ModeToggle';
import type { Trip } from '../types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function groupByYear(trips: Trip[]): { year: number | null; trips: Trip[] }[] {
  const map = new Map<number | null, Trip[]>();
  for (const t of trips) {
    const y = t.start_date ? new Date(t.start_date).getFullYear() : null;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(t);
  }
  const groups = Array.from(map.entries()).map(([year, ts]) => ({
    year,
    trips: ts.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? '')),
  }));
  groups.sort((a, b) => {
    if (a.year === null) return -1;
    if (b.year === null) return 1;
    return b.year - a.year;
  });
  return groups;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    getTrips().then(({ trips }) => setTrips(trips)).finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => groupByYear(trips), [trips]);

  const canSubmit = title.trim().length > 0 && startDate.length === 10;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const { trip } = await createTrip({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate || undefined,
        description: description.trim() || undefined,
      });
      setTrips(t => [...t, trip]);
      setTitle(''); setStartDate(todayIso()); setEndDate(''); setDescription('');
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🧭 Meine Reisen</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ModeToggle />
          <button onClick={logout} style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      {loading ? <p>Lade…</p> : groups.map(g => (
        <div key={g.year ?? 'none'} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
            {g.year ?? 'Ohne Datum'}
          </div>
          {g.trips.map(t => (
            <div key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
              style={{ background: '#f5f7fa', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', borderLeft: '4px solid #4a90e2' }}>
              <div style={{ fontWeight: 600 }}>{t.title}</div>
              {t.start_date && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.start_date} – {t.end_date ?? '?'}</div>}
            </div>
          ))}
        </div>
      ))}

      {showForm ? (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, background: '#f9fafc', padding: 12, borderRadius: 10 }}>
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Reisetitel *" autoFocus
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }} />
          <label style={{ fontSize: 12, color: '#666' }}>
            Startdatum *
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ display: 'block', padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15, width: '100%', boxSizing: 'border-box', marginTop: 2 }} />
          </label>
          <label style={{ fontSize: 12, color: '#666' }}>
            Enddatum (optional)
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ display: 'block', padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15, width: '100%', boxSizing: 'border-box', marginTop: 2 }} />
          </label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Beschreibung (optional)" rows={3}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={!canSubmit || submitting}
              style={{ flex: 1, padding: '8px 14px', borderRadius: 8, background: canSubmit ? '#4a90e2' : '#bbb', color: '#fff', border: 'none', cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed' }}>
              {submitting ? 'Speichere…' : 'Anlegen'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Abbrechen</button>
          </div>
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

- [ ] **Step 2: TypeScript-Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Dev-Server starten und manuell testen**

Run: `cd pwa && npm run dev`
Dann im Browser:
- Neue Reise mit Titel + Startdatum (heute) anlegen → erscheint unter Jahres-Header "2026".
- Formular-Submit-Button ist disabled wenn Titel leer.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/pages/TripsPage.tsx
git commit -m "feat(pwa): TripsPage year grouping + extended create form"
```

---

## Task 8: PWA `TripPage` — Beschreibungs-Header + Datum beim "+ Neuer Tag"

**Files:**
- Modify: `pwa/src/pages/TripPage.tsx`

- [ ] **Step 1: TripPage komplett ersetzen**

Datei `pwa/src/pages/TripPage.tsx` komplett ersetzen durch:

```tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrips, updateTrip } from '../api/trips';
import { getEntries, createEntry } from '../api/journal';
import ModeToggle from '../components/ModeToggle';
import InlineEditText from '../components/InlineEditText';
import type { Trip, JournalEntry } from '../types';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDayForm, setShowNewDayForm] = useState(false);
  const [newDayDate, setNewDayDate] = useState(todayIso());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([getTrips(), getEntries(tripId!)]).then(([{ trips }, { entries }]) => {
      setTrip(trips.find(t => t.id === tripId) ?? null);
      setEntries(entries);
    }).finally(() => setLoading(false));
  }, [tripId]);

  async function handleNewDay(e: React.FormEvent) {
    e.preventDefault();
    if (!newDayDate || creating) return;
    setCreating(true);
    try {
      const { entry } = await createEntry(tripId!, { blocks: [], date: newDayDate });
      navigate(`/trips/${tripId}/journal/${entry.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function saveDescription(v: string) {
    const { trip: updated } = await updateTrip(tripId!, { description: v });
    setTrip(updated);
  }

  function getThumbnail(entry: JournalEntry): string | null {
    const firstImgBlock = entry.blocks?.find(b => b.type === 'images');
    if (firstImgBlock && firstImgBlock.type === 'images' && firstImgBlock.media_ids.length > 0) {
      const media = entry.media.find(m => m.id === firstImgBlock.media_ids[0]);
      return media?.url ?? null;
    }
    return entry.media[0]?.url ?? null;
  }

  function entryLabelDate(entry: JournalEntry): string {
    const raw = entry.date ?? entry.created_at;
    return new Date(raw).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  }

  function formatTripDates(t: Trip): string {
    if (!t.start_date) return '';
    if (!t.end_date) return `ab ${t.start_date}`;
    return `${t.start_date} – ${t.end_date}`;
  }

  if (loading) return <div style={{ padding: 32 }}>Lade…</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
          <h1 style={{ margin: 0, fontSize: 18 }}>{trip?.title ?? 'Reise'}</h1>
        </div>
        <ModeToggle />
      </div>

      {trip && (
        <div style={{ marginBottom: 20 }}>
          {trip.start_date && (
            <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>{formatTripDates(trip)}</div>
          )}
          <InlineEditText
            value={trip.description ?? ''}
            placeholder="Beschreibung hinzufügen…"
            multiline
            onSave={saveDescription}
          />
        </div>
      )}

      {entries.map((entry, i) => {
        const thumb = getThumbnail(entry);
        const photoCount = entry.media.length;
        const date = entryLabelDate(entry);
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

      {showNewDayForm ? (
        <form onSubmit={handleNewDay} style={{ display: 'flex', gap: 8, marginTop: 12, background: '#f9fafc', padding: 12, borderRadius: 10, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: '#666', flex: 1 }}>
            Datum *
            <input type="date" value={newDayDate} onChange={e => setNewDayDate(e.target.value)} autoFocus required
              style={{ display: 'block', padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15, width: '100%', boxSizing: 'border-box', marginTop: 2 }} />
          </label>
          <button type="submit" disabled={!newDayDate || creating}
            style={{ padding: '8px 14px', borderRadius: 8, background: '#4a90e2', color: '#fff', border: 'none', cursor: creating ? 'wait' : 'pointer' }}>OK</button>
          <button type="button" onClick={() => setShowNewDayForm(false)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>✕</button>
        </form>
      ) : (
        <button onClick={() => setShowNewDayForm(true)}
          style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, border: '2px dashed #4a90e2', background: '#f0f6ff', color: '#4a90e2', cursor: 'pointer', fontSize: 14, width: '100%' }}>
          + Neuer Tag
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript-Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Manuell testen**

Mit laufendem `npm run dev`:
- Reise öffnen → Header zeigt Titel, Datumszeile, Beschreibungs-Block mit ✏️ (oder Placeholder falls leer).
- Beschreibung editieren → speichern → reload → Text persistiert.
- "+ Neuer Tag" klicken → Datum-Picker mit heute default → OK → navigiert zu JournalEntryPage.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/pages/TripPage.tsx
git commit -m "feat(pwa): TripPage description editor + date-mandatory new day form"
```

---

## Task 9: PWA `JournalEntryPage` + `ViewPage` — Datum editierbar / sichtbar

**Files:**
- Modify: `pwa/src/pages/JournalEntryPage.tsx`
- Modify: `pwa/src/pages/JournalEntryViewPage.tsx`

- [ ] **Step 1: JournalEntryPage aktuellen Header lokalisieren**

Run: `grep -n "created_at\|toLocaleDateString\|date" pwa/src/pages/JournalEntryPage.tsx`

Notiere: wo wird das Entry-Datum angezeigt / war die Header-Struktur.

- [ ] **Step 2: Edit-Page — `date` im Header via InlineEditText**

In `pwa/src/pages/JournalEntryPage.tsx`:

- Import ergänzen: `import InlineEditText from '../components/InlineEditText';` und `import { updateEntry } from '../api/journal';` (falls noch nicht vorhanden).
- Im Komponenten-State das aktuelle `entry.date` verfügbar machen (falls entry bereits im State liegt, ok).
- Im Header (dort wo aktuell das Datum aus `created_at` kommt) den Datumstext durch folgenden Block ersetzen:

```tsx
{entry && (
  <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
    <InlineEditText
      value={entry.date ?? ''}
      placeholder="Datum setzen"
      inputType="date"
      onSave={async (v) => {
        const { entry: updated } = await updateEntry(tripId!, entry.id, { date: v });
        setEntry(updated);
      }}
    />
  </div>
)}
```

Hinweis für Implementierer: Falls der State nicht `entry`/`setEntry` heißt, Namen entsprechend anpassen. Falls `tripId` nicht aus `useParams` kommt, Pfad aus der Datei übernehmen.

- [ ] **Step 3: View-Page — Datum anzeigen**

In `pwa/src/pages/JournalEntryViewPage.tsx`: falls dort ein Datumstext aus `created_at` formatiert wird, diesen ersetzen durch:

```tsx
{new Date(entry.date ?? entry.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}
```

- [ ] **Step 4: TypeScript-Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Manuell testen**

Dev-Server läuft: Entry öffnen → Datum im Header sichtbar → ✏️ → Date-Picker → anderes Datum → speichern → zurück zur TripPage → Sortierung und Tag-N-Nummerierung stimmen.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/pages/JournalEntryPage.tsx pwa/src/pages/JournalEntryViewPage.tsx
git commit -m "feat(pwa): journal entry date editable in header"
```

---

## Task 10: Deploy + manuelle Abnahme gegen Live

**Files:** (keine)

- [ ] **Step 1: Backend deployen (inkl. Migration)**

Run:
```bash
eval $(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519
ssh root@192.168.2.111 "cd /var/www/reise && git pull && psql -U reise -d reise -f backend/migrations/005_journal_entry_date.sql && cd backend && npm ci && npm run build && pm2 restart reise-api --update-env"
```
Expected: Migration `ALTER TABLE` ok (oder `column already exists` wenn bereits lokal angewendet — dann harmlos). PM2 restart ohne Fehler.

- [ ] **Step 2: PWA deployen**

Run:
```bash
ssh root@192.168.2.111 "cd /var/www/reise/pwa && npm ci && npm run build"
```
Expected: build ohne Fehler.

- [ ] **Step 3: Abnahmekriterien prüfen**

Live in `https://tagebuch.jan-toenhardt.de` mit Jan-Account:

1. Neue Reise "Testreise 2026" mit Titel + Startdatum (heute) anlegen → erscheint unter Jahres-Header "2026".
2. Baltikum-2026-Reise öffnen → Beschreibung via ✏️ setzen → Reload → Text persistiert.
3. In Baltikum-2026 neuen Tag mit Datum `2026-06-10` anlegen → TripPage zeigt ihn korrekt einsortiert.
4. Tag-Datum nachträglich auf `2026-06-05` ändern → zurück zur TripPage → neue Reihenfolge + Tag-N-Label korrekt.
5. Altbestand-Entries (vor Migration) erscheinen am Ende der Liste (NULLS LAST).

- [ ] **Step 4: Testreise wieder löschen**

Per DB (nicht im UI, da delete-UI aktuell fehlt):
```bash
ssh root@192.168.2.111 "psql -U reise -d reise -c \"DELETE FROM trips WHERE title = 'Testreise 2026';\""
```

- [ ] **Step 5: Abschluss-Commit (falls Tweaks während Abnahme)**

```bash
git status
# Falls Änderungen: commit + push
```

---

## Self-Review Notes

Selbst­review durchgeführt:
- **Spec coverage**: Alle 8 Entscheidungen aus dem Spec-Abschnitt "Entscheidungen" sind durch Tasks abgedeckt (Migration: T1; Backend date-Handling: T2–T4; Jahres-Gruppierung: T7; Erweitertes Formular: T7; Beschreibung editierbar: T8; Pflicht-Datum bei Tag-Anlegen: T8; Datum editierbar: T9).
- **Placeholder scan**: Task 9 hat eine bewusst flexible Anweisung, weil die aktuelle `JournalEntryPage.tsx` nicht vollständig ausgelesen wurde — der Implementierer muss die aktuelle Header-Struktur lokal finden. Nicht ideal, aber aufrichtiger als ein erfundener Drop-in.
- **Type consistency**: `date` als `string` (`YYYY-MM-DD`) überall konsistent. `updateTrip` und `updateEntry` liefern beide `{ entry/trip }` zurück.
- **Scope**: Sub-Projekt 2 only. HTML-Generation und Publish sind explizit in Sub-Projekt 3 verschoben.
