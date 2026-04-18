# Sub-Projekt 3: Publish-Pipeline nach tönhardt.de — Design

**Datum:** 2026-04-18
**Status:** Design approved, awaiting implementation plan
**Vorgänger:** Sub-Projekt 2 (Trip-Verwaltung in PWA, live 18.04.2026)
**Ziel-Repo für Publishes:** `jan74berlin/toenhardt`
**Live-Ziel:** `https://xn--tnhardt-90a.de/` (Strato Hauptversion, umlautsicher via Punycode)

## Ziel

Einzelne Tage einer Reise aus der PWA veröffentlichen, sodass sie als Teil der bestehenden SPA auf `toenhardt.de` erscheinen — inklusive automatisch generierter Reise-Übersichtsseite, korrekter Navigation und Git-History in `jan74berlin/toenhardt`.

## Zielbild

- Jan klickt auf einer Tagesseite in der PWA "Veröffentlichen"
- Das Backend rendert HTML, lädt per SFTP hoch, aktualisiert `pages.json`, committet + pusht in `toenhardt`
- Innerhalb weniger Sekunden ist die Seite live unter `https://xn--tnhardt-90a.de/#<slug>/tag-N`
- Die Reise-Übersicht und das linke Menü der SPA zeigen den neuen Tag automatisch

## Entscheidungen (Brainstorming 18.04.2026)

1. **Scope:** Variante C — Tages-HTML + auto-generierte Reise-Übersicht + auto-gepflegte Nav + Git-History.
2. **Rendering-Ort:** Variante A — Backend rendert, PWA triggert nur.
3. **Git-Commit:** Variante A — SSH-Deploy-Key auf LXC 111, Backend pusht direkt zu `jan74berlin/toenhardt`.
4. **Datenquelle in toenhardt.de:** Variante C — einmaliges Refactoring, `PAGES` raus aus `index.html` in separate `pages.json`, Nav wird beim Seiten-Init aus `pages.json` generiert.
5. **Publish-Einheit:** Einzelne Tage unabhängig veröffentlichbar. Übersichtsseite listet nur veröffentlichte Tage. Neuer DB-Flag `is_published` auf `journal_entries`.

## Architektur

### Abschnitt 1 — PWA (User-sichtbare Änderungen)

**JournalEntryPage (Desktop-Modus)**:
- Neuer Header-Bereich: Status-Badge `⚪ Entwurf` oder `🟢 Online seit <Datum>`
- Button "👁 Vorschau" → öffnet Modal mit iframe `srcdoc`, das das per `/preview`-Route geholte HTML zeigt
- Button "Veröffentlichen" (bzw. "Aktualisieren" wenn `is_published=true`) → triggert `POST /publish`, danach Badge auf `🟢 Online seit …`
- Dezenter Link "Zurückziehen" (nur sichtbar wenn published) → triggert `POST /unpublish`, Badge zurück auf `⚪ Entwurf`
- Link "Auf tönhardt.de ansehen" (nur wenn published) → öffnet die Live-URL in neuem Tab

**TripPage**:
- Zeile unter Titel: "**X von N Tagen veröffentlicht**"
- Kleines Icon/Button "Alle aktualisieren" — republished alle bereits-publizierten Tage (nützlich nach Trip-Titel- oder Beschreibungs-Änderung, damit die Übersichtsseite sich neu baut)

**Keine Publish-Aktionen im Mobile-Modus** — bewusst desktop-only, weil Publish eine redaktionelle Handlung ist.

### Abschnitt 2 — Backend

**Migration 006** (`006_publish_pipeline.sql`):
```sql
ALTER TABLE journal_entries ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE journal_entries ADD COLUMN publish_seq INTEGER;
ALTER TABLE journal_entries ADD COLUMN first_published_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX trips_slug_unique ON trips(slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX journal_entries_publish_seq_unique ON journal_entries(trip_id, publish_seq) WHERE publish_seq IS NOT NULL;
```

- `is_published`: aktueller Live-Status (kann nach Unpublish wieder false werden)
- `publish_seq`: einmal vergebene, stabile URL-Nummer (`tag-<seq>`). Bleibt bestehen nach Unpublish.
- `first_published_at`: für Badge "🟢 Online seit …"

**Slug-Generierung**: Beim ersten Publish einer Reise wird aus `trips.title` ein URL-Safe-Slug erzeugt (`"Baltikum 2026"` → `baltikum-2026`). Bei Kollision wird ein Suffix angehängt (`baltikum-2026-2`). Slug ist danach immutable — Titel-Änderungen ändern die URL nicht mehr.

**Neue Routen** (in `backend/src/publish/router.ts`):
- `GET  /api/v1/trips/:tripId/journal/:entryId/preview` → liefert `{ html: string }`. Kein Side-Effect. Nutzt dieselbe Render-Pipeline wie `/publish`, aber schreibt nirgendwo hin.
- `POST /api/v1/trips/:tripId/journal/:entryId/publish` → siehe Publish-Flow unten. Liefert `{ url: string, is_published: true, published_at: ISO }`.
- `POST /api/v1/trips/:tripId/journal/:entryId/unpublish` → entfernt Tag aus `pages.json`, updatet Übersicht, committet. Liefert `{ is_published: false }`.
- `POST /api/v1/trips/:tripId/publish-all` → republished alle bereits-publizierten Tage (für "Alle aktualisieren"-Button).

**Neues Modul** `backend/src/publish/template.ts`:
- `renderTag(trip: Trip, entry: JournalEntry, media: Media[]): string` — produziert die Tagesseite im Format der bestehenden live-Tagesseiten (Kopf + Blocks + Footer mit Prev/Next)
- `renderOverview(trip: Trip, publishedEntries: JournalEntry[]): string` — produziert die Reise-Übersichtsseite

Templates sind einfache Template-Literals ohne externe Dependency. HTML-Escaping über kleine Helper-Funktion (analog zum `esc()` in der bestehenden `index.html`).

**Publish-Flow** (Happy Path):
1. Lade Trip + Entry + Media aus DB
2. Falls `trip.slug` null → generiere + speichere Slug
3. `renderTag(...)` → HTML-String
4. SFTP-Upload als `/<slug>/tag-<N>/index.html` (N = Index in date-sortierter, published-Liste, 1-basiert)
5. Clone/Pull das `toenhardt`-Repo auf LXC (falls noch nicht lokal: in `/var/www/toenhardt-repo/`)
6. Update `pages.json` (key `<slug>/tag-<N>` wird gesetzt/überschrieben)
7. Update Übersichtsseite — `pages.json` key `<slug>` wird neu berechnet mit aktueller published-Liste
8. SFTP-Upload der `pages.json` auch zu Strato (damit Live sofort aktuell ist)
9. `git add pages.json && git commit -m "publish: <slug>/tag-<N>" && git push`
10. DB: `UPDATE journal_entries SET is_published = true WHERE id = ?`
11. Response an PWA

**Ordnung der Schritte ist wichtig**: SFTP vor Git. Wenn SFTP fehlschlägt, ist nichts live, nichts committet, Flag bleibt false. Wenn Git fehlschlägt, ist live zwar korrekt, aber Git out-of-sync — Backend macht 1× Retry, bei Fehler 207 Multi-Status mit `{ sftp: ok, git: failed, message: "..." }`.

**Git-Lifecycle**:
- Erster Start: Backend prüft ob `/var/www/toenhardt-repo/.git` existiert, sonst `git clone git@github.com:jan74berlin/toenhardt.git`
- Vor jedem Publish: `git pull --rebase` (damit Jan auch lokal commiten kann ohne Konflikte)
- Nach jedem Publish: `git push`
- SSH-Key: liegt auf LXC unter `/root/.ssh/toenhardt_deploy` (neu generiert, kein Passwort), in GitHub als Write-Access-Deploy-Key registriert

**Unpublish-Flow**:
1. Entferne key `<slug>/tag-<N>` aus `pages.json`
2. Die N+1…M Tage rutschen um eins nach unten? **NEIN** — `N` ist stabil aus `date`-Index, nicht aus Position. Details siehe "URL-Stabilität" unten.
3. Update Übersichtsseite
4. SFTP-Upload `pages.json`
5. Git-Commit + Push
6. DB: `UPDATE journal_entries SET is_published = false`
7. Die Tagesseite-HTML auf Strato bleibt liegen (kein SFTP-Delete — 404 entsteht trotzdem, weil der Nav-Link weg ist und `pages.json` den key nicht mehr hat)

**URL-Stabilität**:
- Tag-Nummer N = Position der Entry in der date-sortierten, **published-und-ehemals-published**-Liste, 1-basiert. Sobald ein Tag publiziert wurde, behält er seinen N-Wert, auch wenn er später unpublished wird oder wenn davor ein neuer Tag eingefügt und publiziert wird.
- `publish_seq` wird beim ersten Publish vergeben (max+1 innerhalb des Trips). Stable URLs sind wichtiger als perfekte Tag-Reihenfolge in der Übersicht.
- Die **Übersichtsseite** sortiert und nummeriert visuell trotzdem nach `date` — nur die URL nutzt `publish_seq`. Users sehen "Tag 3 · 10. Juni", URL ist `/baltikum-2026/tag-5/`.

**Deploy-Pfad auf LXC**:
- Backend-Code: `/var/www/reise/backend/`
- toenhardt-Clone: `/var/www/toenhardt-repo/` (neu)
- Strato-SFTP-Ziel: `/` (root des xn--tnhardt-90a.de) — muss bestätigt werden; aktuell wird `/_entwuerfe/` genutzt, Publishes gehen nach `/<slug>/`

### Abschnitt 3 — Templates und Fehlerfälle

**Tagesseiten-HTML** (eingebettet in die bestehende SPA via `pages.json`, nicht als Standalone-HTML):
- `pages.json`-Entry hat Form `{ title, date, paragraphs, images }` — entspricht dem bestehenden PAGES-Format
- `paragraphs`: Array aus Strings, eins pro Text-Block
- `images`: Array aus URL-Strings (bevorzugt `https://xn--tnhardt-90a.de/_entwuerfe/{tripId}/{uuid}.jpg` — keine Umbenennung/Verschiebung)
- Images und Texte in der Reihenfolge der `blocks` im Entry, also abwechselnd möglich

**Aber**: `pages.json` allein reicht nicht, weil die SPA bisher **keine** automatische Nav-Generierung hatte. Deshalb Refactoring (siehe unten).

**Reise-Übersichts-Template**:
- `pages.json`-Entry `<slug>` hat Form `{ title, description, start_date, end_date, days: [{ seq, date, title, thumbnail, preview_text }] }`
- Die SPA renderer-Funktion wird erweitert um diese Struktur zu rendern (Kartenliste statt Paragraphen).

**toenhardt.de Refactoring** (einmaliges Umbau-Commit):
- `var PAGES = {...}` in der `index.html` rausziehen → `pages.json` + `fetch('./pages.json')` beim Init
- Manuelle Nav-HTML-Blöcke ersetzen durch JS-Funktion `buildNav(PAGES)` die die `<div class="nav-year-group">`s aus `pages.json` generiert (Jahresgruppierung aus `start_date` ableiten, ähnlich wie TripsPage der PWA)
- Alle bestehenden Routen (`urlaub-2021`, `urlaub-2022`, …, `baltikum-2026`, `puzzle`, `quiz`) müssen vor Commit getestet werden
- Puzzle- und Quiz-Seiten bleiben inline, nur die Reise-Daten gehen in pages.json
- Kommentar-Marker in `index.html` für zukünftige Auto-Inserts (falls später nötig)

**Fehlerfälle**:
- **SFTP-Upload schlägt fehl** → Abbruch vor Git-Commit. HTTP 502 an PWA. PWA zeigt Fehlermeldung "Upload fehlgeschlagen, bitte erneut versuchen". DB-Status unverändert.
- **Git-Push schlägt fehl** → SFTP ist bereits live. Backend versucht `git pull --rebase && git push` einmal nach. Wenn das auch fehlschlägt: HTTP 207 Multi-Status mit `{ sftp: "ok", git: "failed", error: "…" }`. PWA zeigt Badge "🟡 Online (Git-Sync ausstehend)". Ein cron oder manueller Retry-Button räumt später auf.
- **Slug-Kollision** → Backend hängt Suffix an (`-2`, `-3`), speichert neuen Slug, PWA bekommt die Live-URL zurück
- **Preview rendert, aber Bilder laden nicht im iframe** → `srcdoc` läuft in origin-null sandbox; Bilder-URLs müssen absolut sein (`https://…`), nicht relativ. Das gilt für unsere Fotos ohnehin
- **Concurrent Publishes** (zwei Tabs gleichzeitig veröffentlichen) → Backend serialisiert per Lock auf Trip-ID (In-Memory-Mutex, reicht für Familie-Scale)
- **Konkurrente Edits in `toenhardt`-Repo** → `git pull --rebase` vor jedem Push; bei Rebase-Konflikt: Abbruch + Fehlermeldung, Mensch muss manuell mergen (sehr selten, da nur Backend schreibt)

**Tests**:
- Unit-Tests für `renderTag` und `renderOverview` mit Snapshot-Vergleich (Fixed JSON → fixed JSON-Output)
- Unit-Tests für Slug-Generierung + Kollisions-Suffix
- Integration-Test `POST /publish` mit gemockten SFTP + Git-Operationen (analog Pattern zu Sub-Projekt 1 `vi.mock('../strato', …)`)
- Integration-Test `POST /unpublish` (entfernt Key, behält `publish_seq`)
- Integration-Test `GET /preview` (kein Side-Effect: DB unverändert, SFTP nicht gerufen)
- Manueller Test gegen Live: einen echten Tag publishen, auf toenhardt.de prüfen, unpublish, erneut publish

**Abnahmekriterien**:
1. Einen Tag einer Reise publishen → erscheint unter `https://xn--tnhardt-90a.de/#<slug>/tag-1`, Nav-Eintrag + Übersichtsseite + Tagesseite alle konsistent
2. Einen zweiten Tag publishen → Übersichtsseite zeigt beide, Nav-Menü hat 2 Tag-Links
3. Einen publizierten Tag editieren + nochmal publishen → Änderung ist sofort live, Git-History zeigt beide Commits
4. Einen Tag zurückziehen → Tag-Link weg aus Nav, Übersicht zählt einen weniger
5. Nach Titel-Änderung der Reise + "Alle aktualisieren" → Übersichtsseite zeigt neuen Titel, URLs unverändert
6. Alle alten Reisen auf `toenhardt.de` (Urlaub 2021–2025, Polen 2024) funktionieren weiter wie vor dem Refactoring
7. Ein Tag wird unterwegs offline erstellt, Publish-Button löst Fehler aus, PWA zeigt klare Meldung statt Spinner-Dauerlauf

## Scope-Abgrenzung

**Explizit enthalten:**
- Migration 006 (`is_published`, `publish_seq`, `trips.slug`)
- 4 neue API-Routen + Publish/Unpublish/Preview/Publish-All
- Backend-Template-Modul für HTML/JSON-Generierung
- Einmaliges Refactoring `toenhardt/index.html` → `pages.json` + Nav-Generator
- SSH-Deploy-Key-Setup auf LXC 111
- PWA-UI (Status-Badge, Vorschau-Modal, Buttons)
- Unit- + Integration-Tests im Backend

**Explizit nicht enthalten:**
- Retroaktives Einpflegen der Urlaub-2021…2025-Ordner ins Git (separates Sub-Projekt, falls gewünscht)
- RSS-Feed, Kommentare, Social-Sharing-Buttons
- Mehrere Redakteure mit Edit-History / Approval-Workflow
- Automatische Bildoptimierung / Lazy-Loading (Bilder sind bereits auf 1280px begrenzt aus PWA)
- Lösch-Funktion für SFTP-Dateien bei Unpublish (URL wird nur aus Nav entfernt; HTML-Datei bleibt als Waise liegen — kein Funktionsschaden)
- Internationalisierung (bleibt deutsch-only)

## Offene Punkte für Implementierungsplan

- Exaktes CSS für Tagesseite + Übersichtsseite: angelehnt an bestehenden toenhardt.de-Look (dark sidebar, orange accent, Comic Sans MS Body, Card-Optik), konkrete Styles im Plan nach Inspektion der live-Seiten
- Strato-SFTP-Ziel-Pfad für Publishes: aktuell `/_entwuerfe/` für PWA-Entwurfsfotos; Publishes sollten unter `/` auf Root-Ebene — zu verifizieren ob der SFTP-User dorthin schreiben darf
- Reise-Übersichts-URL: `<slug>` oder `<slug>/uebersicht`? Bestehende Live-Seite nutzt `urlaub-2024/sommerurlaub-2024` für die Übersicht — also `<slug>` als key. Ich übernehme das Muster.
- Lock-Mechanismus für concurrent Publishes: In-Memory-Mutex reicht für Familie-Scale; kein Redis/DB-Lock nötig
