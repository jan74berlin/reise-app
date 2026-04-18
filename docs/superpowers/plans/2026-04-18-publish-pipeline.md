# Sub-Projekt 3: Publish-Pipeline nach tönhardt.de — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA-gestützter Publish-Button pro Tag, der HTML rendert, per SFTP zu Strato lädt und in `jan74berlin/toenhardt` committet — inkl. auto-generierter Reise-Übersicht und Nav.

**Architecture:** Backend rendert JSON-Einträge für `pages.json` auf `toenhardt.de`. Die Site wird einmalig refactored (PAGES raus aus `index.html` in separate JSON-Datei, Nav-Menü JS-generiert). Git-Commit pusht LXC 111 via SSH-Deploy-Key direkt zu GitHub. Single-Trip-Lock verhindert Race-Conditions.

**Tech Stack:** Node.js/TypeScript + Express + PostgreSQL (Backend), Vitest + supertest (Tests), React + TypeScript + Vite (PWA), ssh2-sftp-client (Strato), simple-git oder direkter `child_process` (Git).

**Spec:** [docs/superpowers/specs/2026-04-18-publish-pipeline-design.md](../specs/2026-04-18-publish-pipeline-design.md)

---

## File Structure

**Create in `reise-app/backend/`:**
- `migrations/006_publish_pipeline.sql` — DB-Schema
- `src/publish/slug.ts` — Slug-Generator mit Kollisionssuffix
- `src/publish/slug.test.ts`
- `src/publish/template.ts` — `renderTagPage`, `renderOverviewPage`, `buildPagesJsonEntry`
- `src/publish/template.test.ts`
- `src/publish/toenhardt-repo.ts` — Clone/Pull/Commit/Push + pages.json read/write
- `src/publish/toenhardt-repo.test.ts`
- `src/publish/lock.ts` — In-Memory-Mutex pro Trip
- `src/publish/router.ts` — 4 neue Routen
- `src/publish/publish.test.ts` — Integration-Tests

**Modify in `reise-app/backend/`:**
- `src/index.ts` — Router einhängen
- `package.json` — ggf. `simple-git` dep

**Create in `reise-app/pwa/`:**
- `src/api/publish.ts` — API-Client-Funktionen
- `src/components/PreviewModal.tsx` — iframe-Modal

**Modify in `reise-app/pwa/`:**
- `src/types.ts` — `JournalEntry.is_published`, `published_at`, `publish_seq`; `Trip.slug`
- `src/pages/JournalEntryPage.tsx` — Status-Badge, Vorschau, Publish-Button
- `src/pages/TripPage.tsx` — "X von N publiziert" + Alle-aktualisieren
- `src/api/journal.ts` — `getEntries` muss neue Felder zurückgeben (passiert automatisch über SELECT \*)

**Create in `jan74berlin/toenhardt` (separates Repo, `C:/Users/jan74berlin/Git/toenhardt/`):**
- `pages.json` — aus bestehendem inline `PAGES` extrahiert
- `nav.js` oder inline: JS-Funktion `buildNav(PAGES)`

**Modify in `jan74berlin/toenhardt/`:**
- `index.html` — `var PAGES = {...}` rausziehen, Nav-HTML-Blöcke ersetzen durch `<div id="nav-reisen"></div>` + JS-Init

---

## Task 1: SSH-Deploy-Key für toenhardt-Repo

**Diese Aufgabe ist teils manuell (GitHub-UI) — kein Agent.** Führe sie einmalig vor Task 2 aus.

- [ ] **Step 1: SSH-Key auf LXC 111 generieren (passwortlos)**

Run (lokal mit SSH-Zugang zum LXC):
```bash
ssh root@100.84.90.104 "ssh-keygen -t ed25519 -f /root/.ssh/toenhardt_deploy -N '' -C 'lxc111-toenhardt-deploy' && cat /root/.ssh/toenhardt_deploy.pub"
```
Expected: `ssh-ed25519 AAAA... lxc111-toenhardt-deploy`

- [ ] **Step 2: Public Key in GitHub als Deploy-Key registrieren**

Gehe zu `https://github.com/jan74berlin/toenhardt/settings/keys/new`.
Title: `LXC 111 publish bot`.
Paste den Public-Key aus Step 1.
Checkbox: **Allow write access**.
Klick **Add key**.

- [ ] **Step 3: SSH-Config auf LXC für GitHub mit diesem Key**

Run:
```bash
ssh root@100.84.90.104 "cat > /root/.ssh/config <<'EOF'
Host github-toenhardt
  HostName github.com
  User git
  IdentityFile /root/.ssh/toenhardt_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking no
EOF
chmod 600 /root/.ssh/config"
```

- [ ] **Step 4: Clone testweise**

Run:
```bash
ssh root@100.84.90.104 "cd /tmp && git clone git@github-toenhardt:jan74berlin/toenhardt.git test-clone && cd test-clone && git log --oneline -1 && cd .. && rm -rf test-clone"
```
Expected: `be8ebdb Route 3 'Meine Favoriten' + Favoriten-Badges in R1/R2` (oder neuerer Commit)

Wenn das durchläuft, Key und Config sind korrekt eingerichtet.

---

## Task 2: Toenhardt.de Refactoring (pages.json + Nav-Generator)

**Wo:** Repo `jan74berlin/toenhardt` (`C:/Users/jan74berlin/Git/toenhardt/`, NICHT reise-app).

**Files:**
- Modify: `C:/Users/jan74berlin/Git/toenhardt/index.html`
- Create: `C:/Users/jan74berlin/Git/toenhardt/pages.json`

- [ ] **Step 1: PAGES-Daten extrahieren**

In `C:/Users/jan74berlin/Git/toenhardt/index.html`: finde die Zeile `var PAGES={...};` (Zeile ~242). Kopiere das JSON-Literal (alles zwischen `var PAGES=` und `;`) in eine neue Datei `pages.json`.

Prüfe dass die Datei valides JSON ist:
```bash
cd /c/Users/jan74berlin/Git/toenhardt
node -e "const p = require('./pages.json'); console.log('pages:', Object.keys(p).length);"
```
Expected: `pages: <Zahl>` (vermutlich 100+)

- [ ] **Step 2: `var PAGES={...};` in index.html ersetzen durch Fetch + Init-Hook**

Ersetze die Zeile `var PAGES={...};` durch:
```javascript
var PAGES={};var NAV_BUILT=false;
fetch('./pages.json',{cache:'no-store'}).then(function(r){return r.json();}).then(function(data){PAGES=data;buildNav();NAV_BUILT=true;render(location.hash.slice(1)||'startseite');});
```

- [ ] **Step 3: `buildNav()`-Funktion hinzufügen**

Nach der `go()`-Funktion (Zeile ~283) diese Funktion einfügen:
```javascript
function buildNav(){
  var container=document.getElementById('nav-reisen');
  if(!container)return;
  var groups={};
  var keys=Object.keys(PAGES);
  for(var i=0;i<keys.length;i++){
    var key=keys[i];
    var page=PAGES[key];
    if(!page||!page.isTripOverview)continue;
    var year=(page.start_date||'').slice(0,4)||'?';
    if(!groups[year])groups[year]=[];
    groups[year].push({slug:key,title:page.title,days:[]});
  }
  for(var k=0;k<keys.length;k++){
    var ke=keys[k];var pg=PAGES[ke];
    if(!pg||!pg.publishSeq||!pg.tripSlug)continue;
    var yr=Object.keys(groups).find(function(y){return groups[y].some(function(t){return t.slug===pg.tripSlug;});});
    if(!yr)continue;
    var trip=groups[yr].find(function(t){return t.slug===pg.tripSlug;});
    trip.days.push({key:ke,seq:pg.publishSeq,title:pg.title});
  }
  var sortedYears=Object.keys(groups).sort(function(a,b){return b.localeCompare(a);});
  var html='';
  for(var y=0;y<sortedYears.length;y++){
    var yy=sortedYears[y];
    var trips=groups[yy];
    for(var t=0;t<trips.length;t++){
      var tr=trips[t];
      var anchor=tr.slug.replace(/[^a-z0-9]/gi,'').slice(0,12);
      tr.days.sort(function(a,b){return a.seq-b.seq;});
      html+='<div class="nav-year-group"><div class="nav-year-header" onclick="toggleYear(\''+anchor+'\')"><span>'+esc(tr.title)+'</span><span class="nav-arrow" id="arr-'+anchor+'">&#9658;</span></div>';
      html+='<a class="nav-overview" onclick="go(\''+tr.slug+'\')" id="nl-'+tr.slug.replace(/\//g,'-')+'">&#220;bersicht</a>';
      html+='<div class="nav-tags" id="tags-'+anchor+'">';
      for(var d=0;d<tr.days.length;d++){
        var day=tr.days[d];
        html+='<a class="nav-tag" onclick="go(\''+day.key+'\')" id="nl-'+day.key.replace(/\//g,'-')+'">Tag '+(d+1)+'</a>';
      }
      html+='</div></div>';
    }
  }
  container.innerHTML=html;
}
```

Hinweis: der Nav-Generator verlässt sich auf zwei neue Felder im PAGES-Format:
- `isTripOverview: true` auf dem Reise-Übersichts-Eintrag
- `publishSeq: number` + `tripSlug: string` auf Tag-Einträgen

Für die bestehenden alten Reisen im pages.json ist das nicht gesetzt — siehe Step 5.

- [ ] **Step 4: Alte Nav-HTML-Blöcke in index.html durch Container ersetzen**

Finde die Zeilen `<div class="nav-year-group">...</div>` (Zeile 114–~220, mehrere Jahresgruppen in Folge). Alle dieses Nav-Gruppen-Blöcke ersetzen durch:
```html
<div id="nav-reisen"></div>
```

Die `<a class="nav-home">`-Zeile für die Startseite (Zeile 113) bleibt bestehen, ebenso alles nach den Jahresgruppen (z.B. Puzzle/Quiz-Links, falls vorhanden).

- [ ] **Step 5: pages.json mit Metadaten für alte Reisen nachrüsten**

Öffne `pages.json` und füge zu jedem bestehenden Eintrag die nötigen Felder hinzu.

Für alle **Reise-Übersichten** (z.B. `urlaub-2024/sommerurlaub-2024`, `urlaub-2025`, `baltikum-2026`):
```json
{
  "title": "...",
  "start_date": "2024-07-15",
  "end_date": "2024-08-05",
  "description": "…",
  "isTripOverview": true,
  ...
}
```
Das Feld `start_date` MUSS gesetzt werden (für Jahresgruppierung). Wenn du's nicht weißt, rate anhand des bestehenden Titels. `end_date`, `description` sind optional aber schön.

Für alle **Tag-Seiten** (z.B. `urlaub-2024/sommerurlaub-2024/tag-1`):
```json
{
  "title": "Tag 1",
  "date": "2024-07-15",
  "paragraphs": [...],
  "images": [...],
  "tripSlug": "urlaub-2024/sommerurlaub-2024",
  "publishSeq": 1
}
```
`tripSlug` ist der parent-key. `publishSeq` entspricht der Tag-Nummer aus dem Key (`tag-1` → 1).

Hinweis: das ist einmalig und macht ~100 Einträge. Der Implementer sollte das mit einem Node-Skript automatisieren:
```javascript
// tools/migrate-pages-json.js
const fs = require('fs');
const p = require('./pages.json');
for (const key of Object.keys(p)) {
  const page = p[key];
  const m = key.match(/^(.+)\/tag-(\d+)$/);
  if (m) {
    page.tripSlug = m[1];
    page.publishSeq = parseInt(m[2]);
  } else if (!page.isTripOverview && !['startseite','puzzle','quiz'].includes(key)) {
    // alles andere mit tagless-key ist vermutlich ein Trip-Overview
    page.isTripOverview = true;
  }
}
fs.writeFileSync('./pages.json', JSON.stringify(p, null, 2));
```

Für Reise-Übersichten die kein `start_date` haben, mach einen zweiten Durchlauf manuell oder lass das Feld leer (die Jahresgruppe wird dann "?" statt Jahr — akzeptabel).

Run: `cd /c/Users/jan74berlin/Git/toenhardt && node tools/migrate-pages-json.js && rm tools/migrate-pages-json.js`

- [ ] **Step 6: Lokal testen**

Öffne `index.html` mit einem lokalen Webserver (pages.json braucht Fetch):
```bash
cd /c/Users/jan74berlin/Git/toenhardt && python -m http.server 8000
```
Navigiere zu `http://localhost:8000/` und prüfe:
- Nav-Menü baut sich
- Klick auf "Urlaub 2025" Übersicht → lädt
- Klick auf "Tag 3" einer Reise → lädt
- Baltikum 2026 funktioniert weiter
- Puzzle, Quiz funktionieren weiter

Wenn irgendwas bricht — schau in die DevTools-Konsole. Häufigste Probleme: fehlende Metadaten in pages.json (siehe Step 5).

- [ ] **Step 7: Commit + SFTP-Upload zu Strato**

```bash
cd /c/Users/jan74berlin/Git/toenhardt
git add pages.json index.html
git commit -m "refactor: PAGES in pages.json ausgelagert, Nav automatisch generiert

Vorbereitung fuer Reise-App Publish-Pipeline. Bestehende Routen
(Urlaub 2021-2025, Baltikum 2026, Polen 2024, Puzzle, Quiz)
funktionieren unveraendert."
git push
```

SFTP-Upload zu Strato (die `pages.json` ist neu, `index.html` geändert). Nutze dein bestehendes Strato-Deploy-Tool/FileZilla:
- Ziel: `xn--tnhardt-90a.de` Server (siehe Memory strato_domains.md)
- Dateien: `index.html` (ersetzen) + `pages.json` (neu anlegen im Root)

- [ ] **Step 8: Live testen**

Öffne `https://xn--tnhardt-90a.de/` und prüfe dass alles weiter funktioniert (gleiche Checks wie Step 6, nur live).

---

## Task 3: Migration 006 — publish_seq, is_published, slug

**Files:**
- Create: `backend/migrations/006_publish_pipeline.sql`

- [ ] **Step 1: Migration schreiben**

```sql
ALTER TABLE journal_entries ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE journal_entries ADD COLUMN publish_seq INTEGER;
ALTER TABLE journal_entries ADD COLUMN first_published_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX trips_slug_unique ON trips(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX journal_entries_publish_seq_unique ON journal_entries(trip_id, publish_seq) WHERE publish_seq IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/006_publish_pipeline.sql
git commit -m "feat(db): migration 006 publish pipeline columns"
```

- [ ] **Step 3: Migration lokal / auf Test-DB anwenden**

Wenn keine lokale PostgreSQL: Die Migration wird im Deploy-Task (Task 15) auf LXC 111 angewendet.

---

## Task 4: Slug-Generator

**Files:**
- Create: `backend/src/publish/slug.ts`
- Create: `backend/src/publish/slug.test.ts`

- [ ] **Step 1: Failing test**

`backend/src/publish/slug.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { slugify, ensureUniqueSlug } from './slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Baltikum 2026')).toBe('baltikum-2026');
  });
  it('handles umlauts', () => {
    expect(slugify('Österreich Südtirol')).toBe('oesterreich-suedtirol');
  });
  it('removes special chars', () => {
    expect(slugify('Urlaub 2024!@#')).toBe('urlaub-2024');
  });
  it('collapses multiple hyphens', () => {
    expect(slugify('A  -  B')).toBe('a-b');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('-foo-')).toBe('foo');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns base slug if not taken', async () => {
    const existing = new Set<string>();
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026');
  });
  it('appends -2 on first collision', async () => {
    const existing = new Set(['baltikum-2026']);
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026-2');
  });
  it('appends -3 on second collision', async () => {
    const existing = new Set(['baltikum-2026', 'baltikum-2026-2']);
    expect(await ensureUniqueSlug('baltikum-2026', existing)).toBe('baltikum-2026-3');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd backend && npm test -- slug`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`backend/src/publish/slug.ts`:
```typescript
const UMLAUT_MAP: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
  'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue',
};

export function slugify(input: string): string {
  let s = input;
  for (const [u, r] of Object.entries(UMLAUT_MAP)) s = s.split(u).join(r);
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-|-$/g, '');
  return s;
}

export async function ensureUniqueSlug(base: string, existing: Set<string>): Promise<string> {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
```

- [ ] **Step 4: Test passes**

Run: `npm test -- slug`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/publish/slug.ts backend/src/publish/slug.test.ts
git commit -m "feat(publish): slug generator with collision suffix"
```

---

## Task 5: Template-Modul

**Files:**
- Create: `backend/src/publish/template.ts`
- Create: `backend/src/publish/template.test.ts`

- [ ] **Step 1: Failing tests**

`backend/src/publish/template.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildTagPageEntry, buildOverviewPageEntry } from './template';

const sampleTrip = {
  id: 't1', title: 'Baltikum 2026', slug: 'baltikum-2026',
  description: 'Wohnmobiltour 6.–27. Juni 2026',
  start_date: '2026-06-06', end_date: '2026-06-27',
};
const sampleEntry = {
  id: 'e1', trip_id: 't1', date: '2026-06-10', publish_seq: 1,
  blocks: [
    { type: 'text', content: 'Erster Tag in Polen.' },
    { type: 'images', media_ids: ['m1', 'm2'] },
    { type: 'text', content: 'Wetter super!' },
  ],
  media: [
    { id: 'm1', url: 'https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg', filename: 'a.jpg' },
    { id: 'm2', url: 'https://xn--tnhardt-90a.de/_entwuerfe/t1/def.jpg', filename: 'b.jpg' },
  ],
};

describe('buildTagPageEntry', () => {
  it('produces PAGES-shaped JSON entry', () => {
    const result = buildTagPageEntry(sampleTrip as any, sampleEntry as any);
    expect(result.key).toBe('baltikum-2026/tag-1');
    expect(result.value.title).toBe('Tag 1');
    expect(result.value.date).toBe('2026-06-10');
    expect(result.value.tripSlug).toBe('baltikum-2026');
    expect(result.value.publishSeq).toBe(1);
    expect(result.value.paragraphs).toEqual(['Erster Tag in Polen.', 'Wetter super!']);
    expect(result.value.images).toEqual([
      'https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg',
      'https://xn--tnhardt-90a.de/_entwuerfe/t1/def.jpg',
    ]);
  });

  it('orders paragraphs and images by block order', () => {
    const entry = {
      ...sampleEntry,
      blocks: [
        { type: 'images', media_ids: ['m1'] },
        { type: 'text', content: 'Erst Foto, dann Text.' },
      ],
    };
    const result = buildTagPageEntry(sampleTrip as any, entry as any);
    expect(result.value.images).toEqual(['https://xn--tnhardt-90a.de/_entwuerfe/t1/abc.jpg']);
    expect(result.value.paragraphs).toEqual(['Erst Foto, dann Text.']);
  });
});

describe('buildOverviewPageEntry', () => {
  it('produces overview JSON entry', () => {
    const publishedEntries = [
      { ...sampleEntry, publish_seq: 1, date: '2026-06-10' },
      { ...sampleEntry, id: 'e2', publish_seq: 2, date: '2026-06-11', blocks: [{ type: 'text', content: 'Zweiter Tag.' }], media: [] },
    ];
    const result = buildOverviewPageEntry(sampleTrip as any, publishedEntries as any);
    expect(result.key).toBe('baltikum-2026');
    expect(result.value.title).toBe('Baltikum 2026');
    expect(result.value.description).toBe('Wohnmobiltour 6.–27. Juni 2026');
    expect(result.value.start_date).toBe('2026-06-06');
    expect(result.value.isTripOverview).toBe(true);
    expect(result.value.days).toHaveLength(2);
    expect(result.value.days[0]).toMatchObject({ seq: 1, date: '2026-06-10', preview_text: 'Erster Tag in Polen.' });
    expect(result.value.days[1]).toMatchObject({ seq: 2, date: '2026-06-11' });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- template`
Expected: FAIL.

- [ ] **Step 3: Implement**

`backend/src/publish/template.ts`:
```typescript
interface Trip {
  id: string;
  title: string;
  slug: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

interface Media {
  id: string;
  url: string;
  filename?: string;
}

interface Block {
  type: 'text' | 'images';
  content?: string;
  media_ids?: string[];
}

interface JournalEntry {
  id: string;
  trip_id: string;
  date: string | null;
  publish_seq: number | null;
  blocks: Block[] | null;
  media: Media[];
}

export interface TagPageEntry {
  key: string;
  value: {
    title: string;
    date: string | null;
    paragraphs: string[];
    images: string[];
    tripSlug: string;
    publishSeq: number;
  };
}

export interface OverviewPageEntry {
  key: string;
  value: {
    title: string;
    description: string | null;
    start_date: string | null;
    end_date: string | null;
    isTripOverview: true;
    days: Array<{
      seq: number;
      date: string | null;
      title: string;
      thumbnail: string | null;
      preview_text: string;
    }>;
  };
}

export function buildTagPageEntry(trip: Trip, entry: JournalEntry): TagPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');
  if (entry.publish_seq == null) throw new Error('entry.publish_seq required');

  const blocks = Array.isArray(entry.blocks) ? entry.blocks : [];
  const paragraphs: string[] = [];
  const images: string[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.content) {
      paragraphs.push(b.content);
    } else if (b.type === 'images' && b.media_ids) {
      for (const mid of b.media_ids) {
        const m = entry.media.find((x) => x.id === mid);
        if (m) images.push(m.url);
      }
    }
  }

  return {
    key: `${trip.slug}/tag-${entry.publish_seq}`,
    value: {
      title: `Tag ${entry.publish_seq}`,
      date: entry.date,
      paragraphs,
      images,
      tripSlug: trip.slug,
      publishSeq: entry.publish_seq,
    },
  };
}

export function buildOverviewPageEntry(trip: Trip, published: JournalEntry[]): OverviewPageEntry {
  if (!trip.slug) throw new Error('trip.slug required');

  const sorted = [...published].sort((a, b) => {
    const da = a.date ?? '';
    const db = b.date ?? '';
    return da.localeCompare(db);
  });

  const days = sorted.map((e) => {
    const blocks = Array.isArray(e.blocks) ? e.blocks : [];
    const firstText = blocks.find((b) => b.type === 'text' && b.content);
    const firstImgBlock = blocks.find((b) => b.type === 'images' && b.media_ids && b.media_ids.length > 0);
    const firstImg = firstImgBlock ? e.media.find((m) => m.id === firstImgBlock.media_ids![0]) : null;
    const preview = firstText?.content ?? '';
    return {
      seq: e.publish_seq!,
      date: e.date,
      title: `Tag ${e.publish_seq}`,
      thumbnail: firstImg?.url ?? null,
      preview_text: preview.slice(0, 160),
    };
  });

  return {
    key: trip.slug,
    value: {
      title: trip.title,
      description: trip.description ?? null,
      start_date: trip.start_date ?? null,
      end_date: trip.end_date ?? null,
      isTripOverview: true,
      days,
    },
  };
}
```

- [ ] **Step 4: Tests pass**

Run: `npm test -- template`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/publish/template.ts backend/src/publish/template.test.ts
git commit -m "feat(publish): template module builds pages.json entries"
```

---

## Task 6: Toenhardt-Repo-Helper

**Files:**
- Create: `backend/src/publish/toenhardt-repo.ts`
- Create: `backend/src/publish/toenhardt-repo.test.ts`

- [ ] **Step 1: Failing test**

`backend/src/publish/toenhardt-repo.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readPagesJson, writePagesJson } from './toenhardt-repo';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'toenhardt-test-'));
});

describe('readPagesJson / writePagesJson', () => {
  it('reads existing pages.json', async () => {
    const fp = path.join(tmpDir, 'pages.json');
    await fs.writeFile(fp, JSON.stringify({ foo: { title: 'Foo' } }));
    const pages = await readPagesJson(tmpDir);
    expect(pages.foo.title).toBe('Foo');
  });

  it('returns empty object if pages.json missing', async () => {
    const pages = await readPagesJson(tmpDir);
    expect(pages).toEqual({});
  });

  it('writes pages.json with pretty JSON', async () => {
    await writePagesJson(tmpDir, { bar: { title: 'Bar' } });
    const content = await fs.readFile(path.join(tmpDir, 'pages.json'), 'utf-8');
    expect(content).toContain('"bar"');
    expect(content).toContain('"Bar"');
    expect(JSON.parse(content).bar.title).toBe('Bar');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm test -- toenhardt-repo`
Expected: FAIL.

- [ ] **Step 3: Implement**

`backend/src/publish/toenhardt-repo.ts`:
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

const REPO_PATH = process.env.TOENHARDT_REPO_PATH ?? '/var/www/toenhardt-repo';
const REMOTE_URL = process.env.TOENHARDT_REMOTE_URL ?? 'git@github-toenhardt:jan74berlin/toenhardt.git';

export type PagesJson = Record<string, Record<string, unknown>>;

export async function readPagesJson(repoPath: string = REPO_PATH): Promise<PagesJson> {
  try {
    const content = await fs.readFile(path.join(repoPath, 'pages.json'), 'utf-8');
    return JSON.parse(content);
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writePagesJson(repoPath: string = REPO_PATH, pages: PagesJson): Promise<void> {
  const fp = path.join(repoPath, 'pages.json');
  await fs.writeFile(fp, JSON.stringify(pages, null, 2), 'utf-8');
}

export async function ensureRepoCloned(): Promise<void> {
  try {
    await fs.access(path.join(REPO_PATH, '.git'));
  } catch {
    await execFileP('git', ['clone', REMOTE_URL, REPO_PATH]);
  }
}

export async function pullRepo(): Promise<void> {
  await execFileP('git', ['-C', REPO_PATH, 'pull', '--rebase']);
}

export async function commitAndPush(message: string): Promise<void> {
  await execFileP('git', ['-C', REPO_PATH, 'add', 'pages.json']);
  const status = await execFileP('git', ['-C', REPO_PATH, 'status', '--porcelain']);
  if (!status.stdout.trim()) return;
  await execFileP('git', ['-C', REPO_PATH, '-c', 'user.email=lxc111@toenhardt.de', '-c', 'user.name=LXC Publish Bot', 'commit', '-m', message]);
  try {
    await execFileP('git', ['-C', REPO_PATH, 'push']);
  } catch (err) {
    await execFileP('git', ['-C', REPO_PATH, 'pull', '--rebase']);
    await execFileP('git', ['-C', REPO_PATH, 'push']);
  }
}

export async function syncPagesJsonToStrato(): Promise<void> {
  const Client = (await import('ssh2-sftp-client')).default;
  const sftp = new Client();
  try {
    await sftp.connect({
      host: process.env.STRATO_SFTP_HOST!,
      username: process.env.STRATO_SFTP_USER!,
      password: process.env.STRATO_SFTP_PASSWORD!,
    });
    const localPath = path.join(REPO_PATH, 'pages.json');
    await sftp.put(localPath, '/pages.json');
  } finally {
    await sftp.end();
  }
}
```

- [ ] **Step 4: Tests pass**

Run: `npm test -- toenhardt-repo`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/publish/toenhardt-repo.ts backend/src/publish/toenhardt-repo.test.ts
git commit -m "feat(publish): toenhardt repo helper (read/write pages.json + git)"
```

---

## Task 7: In-Memory-Lock

**Files:**
- Create: `backend/src/publish/lock.ts`

- [ ] **Step 1: Implement**

```typescript
const locks = new Map<string, Promise<void>>();

export async function withTripLock<T>(tripId: string, fn: () => Promise<T>): Promise<T> {
  while (locks.has(tripId)) {
    await locks.get(tripId);
  }
  let release!: () => void;
  const p = new Promise<void>((r) => { release = r; });
  locks.set(tripId, p);
  try {
    return await fn();
  } finally {
    locks.delete(tripId);
    release();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/publish/lock.ts
git commit -m "feat(publish): in-memory mutex per trip"
```

---

## Task 8: Publish-Router mit /preview

**Files:**
- Create: `backend/src/publish/router.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Router-Skelett + /preview implementieren**

`backend/src/publish/router.ts`:
```typescript
import { Router } from 'express';
import { withFamily } from '../db';
import { requireAuth } from '../middleware/requireAuth';
import { buildTagPageEntry } from './template';
import { slugify, ensureUniqueSlug } from './slug';
import { withTripLock } from './lock';

export const publishRouter = Router({ mergeParams: true });
publishRouter.use(requireAuth);

async function loadTripWithEntry(familyId: string, tripId: string, entryId: string) {
  return await withFamily(familyId, async (c) => {
    const t = await c.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (!t.rows[0]) return { trip: null, entry: null };
    const e = await c.query('SELECT * FROM journal_entries WHERE id = $1 AND trip_id = $2', [entryId, tripId]);
    if (!e.rows[0]) return { trip: t.rows[0], entry: null };
    const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1', [entryId]);
    e.rows[0].media = m.rows;
    return { trip: t.rows[0], entry: e.rows[0] };
  });
}

publishRouter.get('/:entryId/preview', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
    if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }
    // For preview, fabricate a slug + seq if not set, so that render works
    const previewTrip = { ...trip, slug: trip.slug ?? slugify(trip.title) };
    const previewEntry = { ...entry, publish_seq: entry.publish_seq ?? 1 };
    const { value } = buildTagPageEntry(previewTrip, previewEntry);
    res.json({ preview: value });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 2: Router einhängen**

In `backend/src/index.ts`: nach den anderen Router-Registrierungen (sucheh `app.use('/api/v1/trips', ...)`) einhängen:
```typescript
import { publishRouter } from './publish/router';
// ...
app.use('/api/v1/trips/:tripId/journal', publishRouter);
```

Hinweis: der journalRouter ist bereits auf `/api/v1/trips/:tripId/journal` montiert. Der publishRouter läuft in Parallel auf denselben Pfad — Express routet nach konkreter Pfadmuster. Die Routen `:entryId/preview`, `:entryId/publish` etc. kollidieren nicht mit den Journal-Routen (`:entryId` alleine oder `:entryId/media` etc.), weil die Suffixe verschieden sind. **Falls Konflikte auftreten:** stattdessen `app.use('/api/v1/trips/:tripId', publishRouter)` und die Routen als `/journal/:entryId/preview` etc. schreiben.

- [ ] **Step 3: Smoke-Test (Build + Start ohne Crash)**

Run: `cd backend && npm run build`
Expected: kein TypeScript-Fehler.

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/router.ts backend/src/index.ts
git commit -m "feat(publish): /preview endpoint (no side-effects)"
```

---

## Task 9: POST /publish

**Files:**
- Modify: `backend/src/publish/router.ts`
- Create: `backend/src/publish/publish.test.ts`

- [ ] **Step 1: Integration-Test**

`backend/src/publish/publish.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../strato', () => ({
  uploadToStrato: vi.fn().mockResolvedValue({
    filePath: '/mocked.jpg', url: 'https://xn--tnhardt-90a.de/mocked.jpg',
  }),
  deleteFromStrato: vi.fn().mockResolvedValue(undefined),
  uploadPagesJson: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./toenhardt-repo', () => ({
  readPagesJson: vi.fn().mockResolvedValue({}),
  writePagesJson: vi.fn().mockResolvedValue(undefined),
  ensureRepoCloned: vi.fn().mockResolvedValue(undefined),
  pullRepo: vi.fn().mockResolvedValue(undefined),
  commitAndPush: vi.fn().mockResolvedValue(undefined),
  syncPagesJsonToStrato: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../index';
import { pool } from '../db';

let token: string;
let tripId: string;
let entryId: string;

beforeAll(async () => {
  await pool.query(`DELETE FROM families WHERE name = 'PublishTestFam'`);
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: 'publishtest@test-reise.de', password: 'pw', display_name: 'PT', family_name: 'PublishTestFam',
  });
  token = reg.body.token;
  const t = await request(app).post('/api/v1/trips').set('Authorization', `Bearer ${token}`).send({ title: 'Publish Testreise', start_date: '2026-06-01' });
  tripId = t.body.trip.id;
  const e = await request(app).post(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`).send({ text: 'Hallo', date: '2026-06-02', blocks: [{ type: 'text', content: 'Hallo' }] });
  entryId = e.body.entry.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM families WHERE name = 'PublishTestFam'`);
});

describe('POST /publish', () => {
  it('publishes an entry, assigns slug + publish_seq, sets is_published', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.is_published).toBe(true);
    expect(res.body.url).toContain('publish-testreise/tag-1');

    const check = await request(app).get(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`);
    const entry = check.body.entries.find((e: any) => e.id === entryId);
    expect(entry.is_published).toBe(true);
    expect(entry.publish_seq).toBe(1);
  });

  it('republish keeps same publish_seq', async () => {
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${entryId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('tag-1');
  });

  it('second entry gets publish_seq=2', async () => {
    const e2 = await request(app).post(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`).send({ date: '2026-06-03', blocks: [] });
    const res = await request(app)
      .post(`/api/v1/trips/${tripId}/journal/${e2.body.entry.id}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.url).toContain('tag-2');
  });
});
```

- [ ] **Step 2: /publish implementieren**

In `backend/src/publish/router.ts` ergänzen (nach dem `/preview`-Handler):

```typescript
import { buildOverviewPageEntry } from './template';
import { readPagesJson, writePagesJson, ensureRepoCloned, pullRepo, commitAndPush, syncPagesJsonToStrato } from './toenhardt-repo';

const LIVE_BASE = process.env.TOENHARDT_LIVE_BASE ?? 'https://xn--tnhardt-90a.de';

async function allPublishedForTrip(familyId: string, tripId: string) {
  return await withFamily(familyId, async (c) => {
    const e = await c.query(
      `SELECT * FROM journal_entries WHERE trip_id = $1 AND is_published = true ORDER BY publish_seq`,
      [tripId]
    );
    for (const ent of e.rows) {
      const m = await c.query('SELECT * FROM media WHERE journal_entry_id = $1', [ent.id]);
      ent.media = m.rows;
    }
    return e.rows;
  });
}

async function assignSlugIfMissing(familyId: string, trip: any): Promise<string> {
  if (trip.slug) return trip.slug;
  return await withFamily(familyId, async (c) => {
    const all = await c.query('SELECT slug FROM trips WHERE slug IS NOT NULL');
    const existing = new Set<string>(all.rows.map((r: { slug: string }) => r.slug));
    const base = slugify(trip.title);
    const unique = await ensureUniqueSlug(base, existing);
    await c.query('UPDATE trips SET slug = $1 WHERE id = $2', [unique, trip.id]);
    return unique;
  });
}

async function assignPublishSeqIfMissing(familyId: string, tripId: string, entry: any): Promise<number> {
  if (entry.publish_seq) return entry.publish_seq;
  return await withFamily(familyId, async (c) => {
    const maxRes = await c.query(
      'SELECT COALESCE(MAX(publish_seq), 0) + 1 AS next FROM journal_entries WHERE trip_id = $1',
      [tripId]
    );
    const next = maxRes.rows[0].next;
    await c.query('UPDATE journal_entries SET publish_seq = $1 WHERE id = $2', [next, entry.id]);
    return next;
  });
}

publishRouter.post('/:entryId/publish', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    await withTripLock(tripId, async () => {
      const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
      if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }

      const slug = await assignSlugIfMissing(req.user.familyId, trip);
      trip.slug = slug;
      const seq = await assignPublishSeqIfMissing(req.user.familyId, tripId, entry);
      entry.publish_seq = seq;

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const tagEntry = buildTagPageEntry(trip, entry);
      pages[tagEntry.key] = tagEntry.value as any;

      await withFamily(req.user.familyId, (c) =>
        c.query(
          'UPDATE journal_entries SET is_published = true, first_published_at = COALESCE(first_published_at, now()) WHERE id = $1',
          [entryId]
        )
      );

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      const overview = buildOverviewPageEntry(trip, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`publish: ${tagEntry.key}`);

      const updated = await withFamily(req.user.familyId, (c) =>
        c.query('SELECT * FROM journal_entries WHERE id = $1', [entryId])
      );
      res.json({
        is_published: true,
        publish_seq: seq,
        first_published_at: updated.rows[0].first_published_at,
        url: `${LIVE_BASE}/#${tagEntry.key}`,
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Tests laufen**

Run: `npm test -- publish`
Expected: 3/3 PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/router.ts backend/src/publish/publish.test.ts
git commit -m "feat(publish): POST publish assigns slug/seq, writes pages.json, git push"
```

---

## Task 10: POST /unpublish

**Files:**
- Modify: `backend/src/publish/router.ts`
- Modify: `backend/src/publish/publish.test.ts`

- [ ] **Step 1: Tests ergänzen**

Am Ende von `publish.test.ts` hinzufügen:
```typescript
describe('POST /unpublish', () => {
  it('sets is_published=false, keeps publish_seq', async () => {
    const e = await request(app).post(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`).send({ date: '2026-06-04', blocks: [] });
    await request(app).post(`/api/v1/trips/${tripId}/journal/${e.body.entry.id}/publish`).set('Authorization', `Bearer ${token}`);

    const unp = await request(app).post(`/api/v1/trips/${tripId}/journal/${e.body.entry.id}/unpublish`).set('Authorization', `Bearer ${token}`);
    expect(unp.status).toBe(200);
    expect(unp.body.is_published).toBe(false);

    const check = await request(app).get(`/api/v1/trips/${tripId}/journal`).set('Authorization', `Bearer ${token}`);
    const ent = check.body.entries.find((x: any) => x.id === e.body.entry.id);
    expect(ent.is_published).toBe(false);
    expect(ent.publish_seq).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: /unpublish implementieren**

In `router.ts`:
```typescript
publishRouter.post('/:entryId/unpublish', async (req, res) => {
  const { tripId, entryId } = req.params as Record<string, string>;
  try {
    await withTripLock(tripId, async () => {
      const { trip, entry } = await loadTripWithEntry(req.user.familyId, tripId, entryId);
      if (!trip || !entry) { res.status(404).json({ error: 'Not found' }); return; }
      if (!entry.is_published) {
        res.json({ is_published: false });
        return;
      }

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const key = `${trip.slug}/tag-${entry.publish_seq}`;
      delete pages[key];

      await withFamily(req.user.familyId, (c) =>
        c.query('UPDATE journal_entries SET is_published = false WHERE id = $1', [entryId])
      );

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      const overview = buildOverviewPageEntry(trip, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`unpublish: ${key}`);

      res.json({ is_published: false });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3: Tests laufen**

Run: `npm test -- publish`
Expected: 4/4 PASS (3 publish + 1 unpublish).

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/router.ts backend/src/publish/publish.test.ts
git commit -m "feat(publish): POST unpublish removes entry from pages.json"
```

---

## Task 11: POST /publish-all (Alle-aktualisieren)

**Files:**
- Modify: `backend/src/publish/router.ts`

- [ ] **Step 1: Test ergänzen**

Am Ende von `publish.test.ts`:
```typescript
describe('POST /publish-all', () => {
  it('republishes all already-published entries', async () => {
    const res = await request(app).post(`/api/v1/trips/${tripId}/publish-all`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.republished).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Route hinzufügen**

In `router.ts`:
```typescript
publishRouter.post('/publish-all', async (req, res) => {
  const { tripId } = req.params as Record<string, string>;
  try {
    const count = await withTripLock(tripId, async () => {
      const { trip } = await loadTripWithEntry(req.user.familyId, tripId, '00000000-0000-0000-0000-000000000000');
      const tripRow = await withFamily(req.user.familyId, (c) => c.query('SELECT * FROM trips WHERE id = $1', [tripId]));
      if (!tripRow.rows[0]) { res.status(404).json({ error: 'Not found' }); return 0; }
      const t = tripRow.rows[0];
      if (!t.slug) { res.json({ republished: 0 }); return 0; }

      await ensureRepoCloned();
      await pullRepo();
      const pages = await readPagesJson();

      const published = await allPublishedForTrip(req.user.familyId, tripId);
      for (const e of published) {
        const te = buildTagPageEntry(t, e);
        pages[te.key] = te.value as any;
      }
      const overview = buildOverviewPageEntry(t, published);
      pages[overview.key] = overview.value as any;

      await writePagesJson(undefined, pages);
      await syncPagesJsonToStrato();
      await commitAndPush(`publish-all: ${t.slug} (${published.length} tags)`);
      res.json({ republished: published.length });
      return published.length;
    });
    return count;
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

Hinweis: das `loadTripWithEntry` mit Dummy-UUID ist ein Hack um nur den Trip zu laden. Besser wäre ein separater `loadTrip()`-Helper — bewusste Abkürzung in diesem Plan, im Code-Review cleanup möglich.

- [ ] **Step 3: Tests laufen**

Run: `npm test -- publish`
Expected: 5/5 PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/publish/router.ts backend/src/publish/publish.test.ts
git commit -m "feat(publish): POST publish-all republishes trip"
```

---

## Task 12: PWA API-Client + Types

**Files:**
- Modify: `pwa/src/types.ts`
- Create: `pwa/src/api/publish.ts`

- [ ] **Step 1: Types erweitern**

`pwa/src/types.ts` — ergänze:
```typescript
export interface Trip {
  id: string;
  title: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  slug?: string | null;
}

export interface JournalEntry {
  id: string;
  trip_id: string;
  night_id?: string;
  user_id: string;
  text?: string;
  blocks?: Block[];
  date?: string;
  is_published?: boolean;
  publish_seq?: number | null;
  first_published_at?: string | null;
  created_at: string;
  updated_at: string;
  media: Media[];
}
```

- [ ] **Step 2: API-Client**

`pwa/src/api/publish.ts`:
```typescript
import { apiFetch } from './client';

export async function previewEntry(tripId: string, entryId: string): Promise<{ preview: Record<string, unknown> }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/preview`);
}

export async function publishEntry(tripId: string, entryId: string): Promise<{ is_published: true; publish_seq: number; first_published_at: string; url: string }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/publish`, { method: 'POST' });
}

export async function unpublishEntry(tripId: string, entryId: string): Promise<{ is_published: false }> {
  return apiFetch(`/api/v1/trips/${tripId}/journal/${entryId}/unpublish`, { method: 'POST' });
}

export async function publishAll(tripId: string): Promise<{ republished: number }> {
  return apiFetch(`/api/v1/trips/${tripId}/publish-all`, { method: 'POST' });
}
```

- [ ] **Step 3: Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/types.ts pwa/src/api/publish.ts
git commit -m "feat(pwa): publish api client + types"
```

---

## Task 13: JournalEntryPage — Status-Badge + Publish-Button

**Files:**
- Modify: `pwa/src/pages/JournalEntryPage.tsx`

- [ ] **Step 1: Imports + State + Vorschau-Handler ergänzen**

Am Anfang von `JournalEntryPage.tsx`:
```typescript
import { previewEntry, publishEntry, unpublishEntry } from '../api/publish';
```

Im `JournalEntryPage`-Component, nach `const [saving, setSaving] = useState(false);`:
```typescript
const [publishing, setPublishing] = useState(false);
const [previewHtml, setPreviewHtml] = useState<string | null>(null);
```

- [ ] **Step 2: Handler-Funktionen**

Innerhalb des Components, nach der `save()`-Funktion:
```typescript
async function handlePreview() {
  if (!entry) return;
  const { preview } = await previewEntry(tripId!, entry.id);
  const p = preview as { title: string; date: string; paragraphs: string[]; images: string[] };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:1rem;color:#333}
    h1{font-size:1.8rem;margin-bottom:.3rem}
    .date{color:#888;margin-bottom:1.5rem}
    p{line-height:1.7;margin-bottom:1rem;white-space:pre-wrap}
    .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.6rem;margin:1rem 0}
    .gallery img{width:100%;height:160px;object-fit:cover;border-radius:6px}
  </style></head><body>
    <h1>${p.title}</h1>
    <div class="date">${p.date ?? ''}</div>
    ${p.paragraphs.map(t => `<p>${t.replace(/</g, '&lt;')}</p>`).join('')}
    ${p.images.length ? `<div class="gallery">${p.images.map(u => `<img src="${u}">`).join('')}</div>` : ''}
  </body></html>`;
  setPreviewHtml(html);
}

async function handlePublishToggle() {
  if (!entry || publishing) return;
  setPublishing(true);
  try {
    if (entry.is_published) {
      await unpublishEntry(tripId!, entry.id);
      setEntry({ ...entry, is_published: false });
    } else {
      const r = await publishEntry(tripId!, entry.id);
      setEntry({ ...entry, is_published: true, publish_seq: r.publish_seq, first_published_at: r.first_published_at });
    }
  } catch (e) {
    alert('Fehler: ' + (e instanceof Error ? e.message : 'unbekannt'));
  } finally {
    setPublishing(false);
  }
}
```

- [ ] **Step 3: UI-Block im Desktop-Header (neben den bestehenden Buttons)**

Finde im Desktop-Return-Block den Abschnitt wo `<button onClick={() => save()}>` ist (um Zeile ~155). Direkt vor dem `💾 Speichern`-Button diesen Block einfügen:

```tsx
<button onClick={handlePreview} disabled={publishing}
  style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
  👁 Vorschau
</button>
<button onClick={handlePublishToggle} disabled={publishing}
  style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: entry.is_published ? '#2a9d4a' : '#e8a838', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
  {publishing ? '…' : entry.is_published ? '🟢 Online' : '📤 Veröffentlichen'}
</button>
{entry.is_published && entry.publish_seq && (
  <a href={`https://xn--tnhardt-90a.de/#${'baltikum-2026'/*fallback*/}/tag-${entry.publish_seq}`}
     target="_blank" rel="noopener noreferrer"
     style={{ fontSize: 12, color: '#4a90e2', alignSelf: 'center', marginLeft: 4 }}>
    Ansehen ↗
  </a>
)}
```

Hinweis: Die Live-URL verwendet `trip.slug`, den wir aus `getEntries()` nicht direkt in `entry` haben. Zwei saubere Optionen:
1. `entry.trip_slug` zusätzlich durch Backend rausgeben (einfacher SELECT mit JOIN)
2. `trip`-State in JournalEntryPage laden (wie in TripPage)

**Wähle Option 2**: zusätzlich oben in `JournalEntryPage`:
```typescript
import { getTrips } from '../api/trips';
// im Component:
const [tripSlug, setTripSlug] = useState<string | null>(null);
// useEffect erweitern:
useEffect(() => {
  getEntries(tripId!).then(({ entries }) => { /* ... */ });
  getTrips().then(({ trips }) => setTripSlug(trips.find(t => t.id === tripId)?.slug ?? null));
}, [tripId, entryId]);
```

Dann im Link: `href={tripSlug && entry.publish_seq ? \`https://xn--tnhardt-90a.de/#${tripSlug}/tag-${entry.publish_seq}\` : undefined}` — den Link nur rendern wenn `tripSlug && entry.is_published`.

- [ ] **Step 4: Vorschau-Modal rendern**

Am Ende des Desktop-Returns, VOR dem schließenden `</div>` des äußeren Containers:
```tsx
{previewHtml && (
  <div onClick={() => setPreviewHtml(null)}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div onClick={e => e.stopPropagation()}
      style={{ background: '#fff', borderRadius: 8, width: 'min(800px, 100%)', height: 'min(80vh, 90%)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Vorschau</strong>
        <button onClick={() => setPreviewHtml(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
      </div>
      <iframe srcDoc={previewHtml} style={{ flex: 1, border: 'none', borderRadius: '0 0 8px 8px' }} />
    </div>
  </div>
)}
```

- [ ] **Step 5: Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add pwa/src/pages/JournalEntryPage.tsx
git commit -m "feat(pwa): JournalEntryPage publish button + preview modal"
```

---

## Task 14: TripPage — Publish-Zähler + Alle-aktualisieren

**Files:**
- Modify: `pwa/src/pages/TripPage.tsx`

- [ ] **Step 1: Handler + UI**

In `TripPage.tsx` oben ergänzen:
```typescript
import { publishAll } from '../api/publish';
```

Im Component, nach `const [creating, setCreating] = useState(false);`:
```typescript
const [publishingAll, setPublishingAll] = useState(false);
const publishedCount = entries.filter(e => e.is_published).length;

async function handlePublishAll() {
  if (publishingAll || publishedCount === 0) return;
  setPublishingAll(true);
  try {
    const r = await publishAll(tripId!);
    alert(`${r.republished} Tage aktualisiert.`);
  } catch (e) {
    alert('Fehler: ' + (e instanceof Error ? e.message : 'unbekannt'));
  } finally {
    setPublishingAll(false);
  }
}
```

- [ ] **Step 2: UI im Header-Bereich**

Finde im TripPage-JSX den Beschreibungs-Block (wo `InlineEditText` für description steht, ca. Zeile 100). Direkt davor oder danach einen kleinen Counter-Block:
```tsx
{trip && entries.length > 0 && (
  <div style={{ fontSize: 12, color: '#666', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
    <span>{publishedCount} von {entries.length} Tagen veröffentlicht</span>
    {publishedCount > 0 && (
      <button onClick={handlePublishAll} disabled={publishingAll}
        title="Übersicht + alle published Tage mit aktuellen Daten neu generieren"
        style={{ background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
        {publishingAll ? '…' : '🔄 Alle aktualisieren'}
      </button>
    )}
  </div>
)}
```

- [ ] **Step 3: Build prüfen**

Run: `cd pwa && npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add pwa/src/pages/TripPage.tsx
git commit -m "feat(pwa): TripPage publish counter + republish-all button"
```

---

## Task 15: Deploy + Abnahme

**Files:** keine

- [ ] **Step 1: Backend deployen (inkl. Migration + toenhardt-repo clone)**

```bash
eval $(ssh-agent -s) && ssh-add ~/.ssh/id_ed25519
ssh root@100.84.90.104 "cd /var/www/reise && git pull && PGPASSWORD=jan74bln psql -U reise -h localhost -d reise -f backend/migrations/006_publish_pipeline.sql ; cd backend && npm ci && npm run build && pm2 restart reise-api --update-env"
```

Migration-Output erwartet: `ALTER TABLE` × 3 + `CREATE INDEX` × 2.

- [ ] **Step 2: PWA deployen**

```bash
ssh root@100.84.90.104 "cd /var/www/reise/pwa && npm ci && npm run build && rm -rf /var/www/tagebuch/assets /var/www/tagebuch/index.html && cp -r dist/* /var/www/tagebuch/"
```

- [ ] **Step 3: toenhardt-Repo initial klonen auf LXC**

```bash
ssh root@100.84.90.104 "test -d /var/www/toenhardt-repo/.git || git clone git@github-toenhardt:jan74berlin/toenhardt.git /var/www/toenhardt-repo"
```
Expected: entweder "already exists" oder `Cloning into …`.

- [ ] **Step 4: Live-Abnahme in der PWA**

Öffne `https://tagebuch.jan-toenhardt.de` (eingeloggt als Jan):

1. Baltikum-Reise öffnen, einen existierenden Tag öffnen (z.B. Tag 1).
2. "👁 Vorschau" klicken → Modal öffnet sich mit dem gerenderten HTML.
3. "📤 Veröffentlichen" klicken → Button wechselt auf "🟢 Online", Link "Ansehen ↗" erscheint.
4. "Ansehen ↗" klickt sich auf `https://xn--tnhardt-90a.de/#baltikum-2026/tag-1` — Tagesseite wird live.
5. Auf `toenhardt.de` prüfen: Linkes Nav hat "Baltikum 2026 → Tag 1" neu, Reise-Übersichtsseite listet den Tag.
6. GitHub-Commit prüfen: `https://github.com/jan74berlin/toenhardt/commits/main` — neuer Commit `publish: baltikum-2026/tag-1` vom LXC-Deploy-Bot.
7. Zweiten Tag publishen → Liste wächst auf 2, URL `/tag-2`.
8. Tag-Datum ändern + nochmal "Veröffentlichen" → dieselbe URL `/tag-1`, aktualisierter Inhalt.
9. "Zurückziehen" (falls Button sichtbar — falls nicht, einfach weglassen) bzw. direkt erneut "Veröffentlichen" → Idempotenz geprüft.
10. Auf TripPage "🔄 Alle aktualisieren" klicken → Alert "2 Tage aktualisiert.".

Falls Schritte 1–4 scheitern: PM2-Logs prüfen:
```bash
ssh root@100.84.90.104 "pm2 logs reise-api --lines 40 --nostream"
```

- [ ] **Step 5: Aufräumen**

Optional: einen Test-Tag zurückziehen (Unpublish) um zu verifizieren dass die Reise-Übersicht sich reduziert.

Wenn alles grün: Memory aktualisieren (sub3 fertig), Sub-Projekt 3 als abgeschlossen markieren.

---

## Self-Review Notes

**Spec coverage:**
- Entscheidungen 1–5 aus Spec sind durch Tasks abgedeckt:
  - Scope C (Tages-HTML + Übersicht + Nav-Gen + Git) → Task 2 (Refactoring), 5 (Templates), 6 (Repo-Helper), 9 (Publish)
  - Backend rendert (A) → Task 5
  - SSH-Deploy-Key (A) → Task 1
  - pages.json + Nav-Gen (C) → Task 2
  - Einzelne Tage publishen → Task 9 + 10
- Alle 4 API-Routen aus Spec sind Tasks (Preview: 8, Publish: 9, Unpublish: 10, Publish-All: 11)
- URL-Stabilität durch `publish_seq` → Migration 006 (Task 3) + `assignPublishSeqIfMissing` (Task 9)
- Concurrent-Lock → Task 7

**Bekannte Abkürzungen im Plan (bewusste Trade-offs):**
- `loadTripWithEntry` in Task 11 mit Dummy-UUID als Hack zum Trip-Load — kein Blocker, Review könnte einen `loadTrip()`-Helper herausziehen
- Das `migrate-pages-json.js`-Skript in Task 2 ist ein Einmal-Tool und wird danach gelöscht — kein Test
- Fehler-Handling in Publish-Flow nutzt generisches 500. Der Spec sagt "207 Multi-Status bei Git-Fehler" — das ist im Plan vereinfacht auf 500 mit Retry in commitAndPush. Wenn Git-Push auch nach Retry scheitert, stirbt der Call mit 500; die Datei ist trotzdem live auf Strato (inkonsistent). Sub-Projekt-3-v2-Erweiterung falls nötig.

**Nicht im Plan:**
- Separate ALT-Reisen-Einpflegung ins Git (explizit spec-abgegrenzt)

**Strato-SFTP für pages.json**: In Task 6 ist `syncPagesJsonToStrato()` eingebaut — nutzt die bestehenden `STRATO_SFTP_*` env vars (gleicher Server wie Foto-Upload), pusht die Datei nach `/pages.json` im Server-Root. Wird in Task 9/10/11 jeweils nach `writePagesJson()` und vor `commitAndPush()` aufgerufen. Tests mocken die Funktion in Task 9.
