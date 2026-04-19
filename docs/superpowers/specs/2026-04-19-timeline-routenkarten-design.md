# Sub-Projekt 4: Google-Maps-Timeline-Import → Tagesrouten — Design

**Datum:** 2026-04-19
**Status:** ⚠️ ENTWURF — wartet auf Review von Jan (mehrere Annahmen markiert)
**Vorgänger:** Sub-Projekt 3 (Publish-Pipeline, live 18.04.2026)

> **Wichtiger Hinweis:** Dieses Dokument wurde geschrieben, während Jan offline war. Die normale Brainstorming-Schleife (eine Frage nach der anderen) wurde übersprungen, um eine konkrete Vorlage zum Reviewen zu liefern. Alle Stellen, an denen ich eine Annahme treffen musste, sind mit **🟡 ANNAHME** markiert. Bitte beim Review überprüfen.

## Ausgangslage

Auf Reisen wird mit Google Maps navigiert. Aktuell screenshottet Jan pro Tag manuell die gefahrene Route in Google Maps und fügt das Bild als Foto in die Tagesseite auf toenhardt.de ein. Das ist:

- manuelle, repetitive Arbeit nach jeder Reise
- die abgebildete Route ist die *vorgeschlagene* Routing-Linie zwischen zwei Punkten, nicht die tatsächlich gefahrene
- die Beschriftung (km, Fahrzeit) muss separat ergänzt werden

Google speichert die Bewegungsdaten on-device in Google Maps („Timeline") und erlaubt Export als JSON. Diese Daten enthalten die *tatsächlich gefahrene* Route mit Wegpunkten, Verkehrsmittel, Distanz und Zeit.

## Ziel

Einmaliger Upload einer Timeline-Export-Datei pro Reise → Backend splittet nach Tagen, generiert pro Tag ein Karten-Bild der gefahrenen Route, schreibt Distanz/Fahrzeit als Metadaten in den Journal-Eintrag, und beim Publish wird die Karte automatisch oben in der Tagesseite auf toenhardt.de dargestellt.

## Zielbild

1. Reise ist zu Ende, Jan exportiert auf dem Handy: Google Maps → Einstellungen → Persönliche Inhalte → Timeline-Daten exportieren → `Timeline.json`
2. In der PWA, TripPage, Button „🗺 Timeline importieren" → File-Picker → JSON wird hochgeladen
3. Backend zeigt Vorschau-Liste:
   - „Tag 1 (10. Juni 2026): 245 km Auto, 3h 12min Fahrzeit, 4 Stopps"
   - „Tag 2 (11. Juni 2026): 87 km Auto, 1h 22min Fahrzeit, 2 Stopps"
   - „Tag 3 (12. Juni 2026): nur Spaziergänge (12 km)"
4. Jan klickt „Importieren" → für jeden Tag mit gefahrener Route wird:
   - Bei fehlendem Journal-Eintrag automatisch einer angelegt (innerhalb `trip.start_date..end_date`)
   - Karten-PNG via Mapbox Static Images API generiert + nach Strato `/_entwuerfe/{tripId}/route_{date}.png` hochgeladen
   - `journal_entries.route_image_url` und `journal_entries.route_meta` gesetzt
5. In der PWA-Tagesseite wird die Karte als „Routen-Header" oberhalb der Blocks angezeigt
6. Beim Publish nach toenhardt.de wird die Karte als erstes Image in den Tag-Block eingefügt, mit Caption „245 km · 3h 12min"

---

## Entscheidungen / Annahmen

### Entscheidung 1: Wie kommen die Daten ins System?

**Optionen:**
- A) Manuelle JSON-Upload via PWA (Datei vom Handy nach Browser, Drag-and-Drop)
- B) Mobile-App (`mobile/`) bekommt Native-File-Picker für `Timeline.json`
- C) Beide

**🟡 ANNAHME → A (manueller Upload via PWA, Desktop)**
- Begründung: Timeline-Export ist eine seltene Aktion (1× pro Reise, am Reise-Ende). Der Aufwand für die Mobile-App rechnet sich nicht.
- Workflow: Handy → Telegram/Email/USB an Desktop → PWA-Upload
- B kann später nachgerüstet werden, falls Bedarf besteht

### Entscheidung 2: Granularität — pro Reise oder pro Tag?

**Optionen:**
- A) Pro Reise: eine JSON, Backend splittet nach Tagen (überspringt Tage außerhalb `trip.start_date..end_date`)
- B) Pro Tag: User wählt explizit eine Tagesseite aus, lädt die zugehörigen Segmente einzeln hoch
- C) Beides erlauben

**🟡 ANNAHME → A (pro Reise)**
- Begründung: Timeline-Export gibt es nur als Komplett-JSON, nicht als Tages-Slice. Pro-Tag wäre künstliche Mehrarbeit.
- Backend filtert auf `trip.start_date <= segment.startTime.date <= trip.end_date`

### Entscheidung 3: Map-Provider für die Routenbilder

**ENTSCHIEDEN am 19.04.2026:** Self-rendered OpenTopoMap (Topo-Look mit Höhenlinien)

Jan hat in der Vergleichs-Demo den OpenTopoMap-Stil ausgewählt — passt zum Wohnmobil-Reise-Charakter und zeigt Höhenprofil der Route.

**Implementierung:**
- npm `staticmaps` Library im Backend (rendert Tiles + Polyline + Marker zu PNG)
- Tile-Source: `https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png`
- **Wichtig:** OpenTopoMap-Nutzungsbedingungen erfordern Tile-Caching auf Server-Seite und einen `User-Agent`-Header. Plan:
  - Lokaler Tile-Cache auf LXC 111 (z.B. `/var/cache/opentopomap-tiles/`) mit TTL ~30 Tage
  - User-Agent: `reise-app/1.0 (https://api.toenhardt.de)`
  - Bei häufiger Nutzung später ggf. eigenen OpenTopoMap-Stil via TileServer GL self-hosten (out-of-scope für Sub-Projekt 4)
- Polyline-Style: kräftige Farbe (Vorschlag `#c0392b` rot oder `#2c3e50` dunkelblau, tritt auf Topo-Hintergrund gut hervor)
- Marker: Start grün, Ende rot (analog Demo)
- Größe: 800×400 Default

**Verworfene Alternativen:**
- ~~Mapbox Static Images API~~ — Look ist nicht der Topo-Stil, den Jan wollte. Bleibt als Provider-Adapter-Option im Code, falls später gewünscht
- ~~Google Static Maps API~~ — kein Topo-Stil, Account-Setup-Hürde
- ~~staticmap.openstreetmap.de~~ — Polyline-Längen-Limit zu eng

**Architektur-Vorteil:** `map.ts` bleibt als Modul mit Adapter-Interface (`renderRouteImage(daySegments) → Buffer`), sodass der Provider später getauscht werden kann ohne API-Routen oder DB-Schema zu ändern.

### Entscheidung 4: Static Bild oder interaktive Karte auf toenhardt.de?

**Optionen:**
- A) Static PNG (so wie heute) — bestehende Bild-/Foto-Pipeline funktioniert ohne Änderung
- B) Interaktiver Leaflet-Embed — Besucher können zoomen/scrollen
- C) Static + Klick öffnet Lightbox mit interaktiver Variante

**🟡 ANNAHME → A (static PNG)**
- Begründung: Drop-in-Ersatz für aktuellen Workflow. toenhardt.de ist eine SPA mit Bildern + Texten — Karten als Bild fügen sich nahtlos ein. Keine zusätzlichen JS-Libs auf der Live-Seite.
- B/C kann später ergänzt werden, wenn gewünscht.

### Entscheidung 5: Welche Verkehrsmittel berücksichtigen?

Timeline-Daten enthalten DRIVING / IN_PASSENGER_VEHICLE / WALKING / CYCLING / IN_BUS etc.

**🟡 ANNAHME**
- Standard: alle motorisierten Segmente werden zur Tagesroute zusammengezeichnet (zeigt das Wohnmobil-Tracking)
- Walking-Segmente am Zielort werden nicht in die Hauptroute aufgenommen, aber in den Metadaten erwähnt („+ 4 km zu Fuß")
- Tage komplett ohne motorisierte Bewegung (Standtag): kein Routenbild, nur Hinweis im Vorschau-Dialog („Standtag — keine Karte generiert")

### Entscheidung 6: Was passiert mit Tagen ohne Journal-Eintrag?

**🟡 ANNAHME → Auto-create**
- Wenn das Datum eines Timeline-Segments innerhalb des Trip-Datumsbereichs liegt, aber noch kein Journal-Eintrag für diesen Tag existiert, wird einer angelegt (leerer `blocks=[]`, `text=null`)
- Begründung: Der Import dient ja gerade dazu, einen Anfangsdatensatz pro Reisetag zu schaffen, den Jan dann mit Texten und Fotos füllt
- Optionaler Toggle im Vorschau-Dialog: „Auto-create für fehlende Tage" (default an)

### Entscheidung 7: Re-Import / Update

**🟡 ANNAHME**
- Wenn ein Tag bereits ein `route_image_url` hat, wird der Import-Vorschau-Dialog zwei Buttons anbieten: „Überschreiben" oder „Überspringen"
- Default: überspringen (sicher), Jan kann pro Tag opt-in für Überschreiben
- Gelöschte alte Strato-PNG wird best-effort entfernt (analog zu `deleteFromStrato`)

---

## Architektur

### Abschnitt 1 — PWA

**TripPage** (neu):
- Ergänzung im Header-Bereich: Button „🗺 Timeline importieren" (Desktop-only, analog zu Publish)
- Klick öffnet Modal `TimelineImportModal.tsx`
  - Schritt 1: File-Picker für `Timeline.json`
  - Schritt 2: Vorschau-Liste pro Tag mit Distanz, Zeit, Stopps; Checkbox „Bild generieren"; bei existierendem Bild Toggle „Überschreiben"
  - Schritt 3: „Importieren"-Button → POST `/timeline/import` → Fortschritts-Anzeige (n von m Tagen verarbeitet)
  - Schritt 4: Ergebnis — Liste der erstellten/aktualisierten Tage mit Mini-Vorschau

**JournalEntryPage** (Erweiterung):
- Wenn `route_image_url` gesetzt: oben in der Bearbeitungsansicht ein Bereich „Routenkarte"
  - Zeigt das Karten-PNG (max-width responsive)
  - Darunter: „245 km · 3h 12min · Auto + Wandern"
  - Kleiner ✏-Button: öffnet Detail-Edit (Caption ändern, Bild manuell ersetzen, Bild entfernen)
  - Anzeige zwischen Header und Blocks (vor dem ersten Text-/Bilder-Block)

**Keine Änderungen an Mobile-App** in Sub-Projekt 4 (siehe Entscheidung 1).

### Abschnitt 2 — Backend

**Neue Module** (`backend/src/timeline/`):

1. `parser.ts` — Parser für `Timeline.json`
   - Unterstützt **beide Formate**:
     - `semanticSegments` (neues on-device Format ab 2024) — Felder `startTime`, `endTime`, `timelinePath: [{ point: "lat°, lng°", time }]`, `activity.topCandidate.type`
     - `timelineObjects` (altes Takeout-Format) — Felder `activitySegment.{startLocation, endLocation, waypointPath, activityType, distance, duration}`
   - Auto-Detection per Top-Level-Key
   - Output: einheitliches `ParsedSegment[]` mit `{ start: Date, end: Date, mode: 'driving'|'walking'|..., points: {lat, lng}[], distanceMeters: number }`

2. `splitter.ts` — Tages-Gruppierung
   - Input: `ParsedSegment[]`, `tripStart`, `tripEnd`
   - Output: `Map<DateString, DaySegments>` mit `{ date, motorizedSegments[], walkingDistanceMeters, totalMotorizedMeters, totalDurationMinutes, modes: Set<string> }`
   - Filtert Segmente außerhalb `tripStart..tripEnd` raus

3. `map.ts` — Bild-Generierung
   - `renderRouteImage(daySegments) → Buffer`
   - Adapter-Interface, aktuelle Implementierung: OpenTopoMap via npm `staticmaps`
   - Nimmt alle motorisierten Segmente, vereinfacht Geometrie (Douglas-Peucker, max ~1000 Punkte)
   - Tile-Source: `https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png` mit lokalem Tile-Cache + Custom User-Agent
   - Polyline `#c0392b` (rot), Stärke 4, Opacity 0.85
   - Start-Marker grün, End-Marker rot (kleine Kreise mit weißem Border)
   - Auto-Bounding-Box mit ~5% Padding, Größe 800×400 (responsive-friendly für SPA)
   - Output: PNG Buffer

4. `router.ts` — neue API-Routen:
   - `POST /api/v1/trips/:tripId/timeline/preview` — Body: JSON-Datei (multipart). Antwort: `{ days: [{ date, distance_km, driving_minutes, modes, segment_count, has_existing_route_image }] }`. Kein Side-Effect.
   - `POST /api/v1/trips/:tripId/timeline/import` — Body: JSON + `{ daysToProcess: ['2026-06-10', ...], overwrite: { '2026-06-10': true } }`. Antwort: `{ processed: [{ date, journal_entry_id, route_image_url, meta }], skipped: [...], errors: [...] }`. Side-Effects: Strato-Upload + DB-Updates (+ ggf. Auto-Create von Entries).

**Migration 007** (`007_route_metadata.sql`):
```sql
ALTER TABLE journal_entries ADD COLUMN route_image_url TEXT;
ALTER TABLE journal_entries ADD COLUMN route_image_path TEXT;
ALTER TABLE journal_entries ADD COLUMN route_meta JSONB;
```
- `route_image_url`: HTTPS-URL zur Strato-PNG (analog `media.url`)
- `route_image_path`: SFTP-Pfad für Cleanup (analog `media.file_path`)
- `route_meta`: `{ distance_km: number, driving_minutes: number, modes: string[], walking_km?: number, segment_count: number, source: 'google-timeline', imported_at: ISO }`

**OpenTopoMap-Setup** (kein Token nötig):
- Tile-Cache-Verzeichnis auf LXC 111: `/var/cache/opentopomap-tiles/{z}/{x}/{y}.png`
- HTTP-Client mit User-Agent-Header `reise-app/1.0 (https://api.toenhardt.de)` (OpenTopoMap-Tile-Usage-Policy)
- Backend `.env` neue Vars (optional, mit Defaults):
  - `OPENTOPOMAP_TILE_CACHE=/var/cache/opentopomap-tiles`
  - `OPENTOPOMAP_TILE_TTL_DAYS=30`
- npm `staticmaps` (^1.x) als Dependency
- Doku in `backend/.env.example` ergänzen

**Strato-Pfad-Schema**:
- Aktuell: `/_entwuerfe/{tripId}/{uuid}.jpg` (Fotos)
- Neu: `/_entwuerfe/{tripId}/route_{YYYY-MM-DD}.png` (Routenkarten) — vorhersagbarer Name für leichtes Überschreiben
- Public URL: `https://xn--tnhardt-90a.de/_entwuerfe/{tripId}/route_{YYYY-MM-DD}.png`

### Abschnitt 3 — Publish-Integration

**Anpassung `backend/src/publish/template.ts → buildTagPageEntry`**:
- Vor der bestehenden Block-Iteration: wenn `entry.route_image_url` gesetzt, einen synthetischen ersten Block einfügen
- `images[0] = entry.route_image_url`
- `paragraphs[0] = "Tagesroute: 245 km · 3h 12min"` (aus `route_meta`)
- `order = ["i0", "p0", ...rest]`
- Ergebnis: Auf der toenhardt.de-Tagesseite erscheint oben die Karte mit Caption darunter, dann normale Inhalte

**Kein Refactoring von `pages.json`**-Schema nötig — passt in die bestehende `paragraphs` / `images` / `order`-Struktur.

**`renderOverview`** bleibt unverändert (Übersichtsseite zeigt erstes Bild jedes Tages — also automatisch die Routenkarte, falls vorhanden).

### Abschnitt 4 — Fehlerfälle

| Fall | Verhalten |
|------|-----------|
| JSON parsefehler / unbekanntes Format | HTTP 400 mit Hinweis „Format nicht erkannt — beide Google-Timeline-Varianten unterstützt" |
| JSON > 50 MB | HTTP 413, mit Hinweis auf Aufteilen (sehr unwahrscheinlich für Reisedauer ≤ 4 Wochen, Schutz gegen Volldump) |
| Trip ohne `start_date` / `end_date` | HTTP 422 — Vorab in PWA prüfen, Button disabled mit Hinweis „Reise braucht Datumsbereich" |
| OpenTopoMap-Tile-Server unerreichbar / 429 Rate-Limit | Pro Tag in `errors[]` zurückgeben, andere Tage trotzdem verarbeiten. Tile-Cache mildert das stark; Retry mit Backoff bei einzelnen Tiles |
| Strato SFTP-Fehler | Analog Sub-Projekt 1: Verbindung in `finally` schließen, Fehler in `errors[]`, andere Tage weiter |
| Tag liegt außerhalb `trip.start_date..end_date` | Aus Vorschau-Liste rausgefiltert, in einer Notiz aufgeführt: „3 Tage außerhalb des Trip-Datumsbereichs übersprungen" |
| Race: Import läuft, jemand publisht denselben Tag | In-Memory-Lock pro `tripId` (analog `publish/lock.ts`), Publish wartet kurz oder gibt 423 |
| Re-Import überschreibt: alte PNG | `deleteFromStrato(old route_image_path)` vor neuem Upload (best-effort, ignoriert Missing-File) |

### Abschnitt 5 — Tests

**Unit-Tests:**
- `parser.test.ts` — beide JSON-Formate (Fixtures aus `backend/src/timeline/__fixtures__/`), inkl. Edge-Cases: leere Segmente, fehlende Felder, Mixed-Mode-Tage
- `splitter.test.ts` — Tagesgrenzen über Mitternacht, Filterung außerhalb Trip, Sortierung
- `map.test.ts` — Polyline-Encoding korrekt (gegen bekannten Erwartungswert), URL-Längen-Limit eingehalten, Mocked-HTTP-Response wird als Buffer zurückgegeben

**Integration-Tests** (analog Pattern Sub-Projekt 1+3):
- `timeline.test.ts` — `POST /preview` mit Fixture, prüft Response-Struktur
- `timeline.test.ts` — `POST /import` mit gemocktem `uploadToStrato` und gemocktem Mapbox-fetch, prüft DB-State danach (route_image_url gesetzt, route_meta korrekt, Auto-Create funktioniert)

**Manueller Live-Test:**
- Eigenen Timeline-Export (Jan privat) gegen den Baltikum-Trip oder eine kleine Testreise importieren
- Auf toenhardt.de prüfen, ob Karte als erstes Bild im Tag erscheint
- Re-Import mit Overwrite=true

### Abschnitt 6 — Abnahmekriterien

1. JSON-Upload (beide Formate) wird angenommen, Vorschau zeigt korrekt aufgeschlüsselte Tage mit Distanz/Zeit
2. Import erstellt für jeden Tag innerhalb Trip-Range ein Routen-PNG auf Strato und setzt `route_image_url` korrekt
3. Tag ohne Journal-Eintrag wird auto-erstellt, mit korrektem `date`-Feld
4. PWA-Tagesseite zeigt Karte oberhalb der Blocks
5. Publish nach toenhardt.de zeigt Karte als erstes Image, mit Distanz/Zeit als Caption
6. Re-Import mit Overwrite ersetzt Bild + Metadaten, lässt andere Inhalte (Texte, Fotos) unangetastet
7. Tag mit nur Walking erzeugt kein Bild, wird im UI als „Standtag" markiert
8. OpenTopoMap-Tile-Server-Fehler (simuliert via 429/503) führt zu sauberer Fehlermeldung pro Tag, andere Tage bleiben erfolgreich
9. Bestehende Reisen ohne Routendaten verhalten sich unverändert (Migration 007 setzt nur Spalten auf NULL)

---

## Scope-Abgrenzung

**Explizit enthalten:**
- Migration 007 (`route_image_url`, `route_image_path`, `route_meta`)
- Backend-Modul `timeline/` mit Parser/Splitter/Map/Router
- OpenTopoMap-Rendering via npm `staticmaps` mit lokalem Tile-Cache
- 2 neue API-Routen (Preview + Import)
- PWA: TripPage-Button + Modal + JournalEntryPage-Routen-Header
- Publish-Template-Erweiterung
- Tests (Unit + Integration)

**Explizit nicht enthalten:**
- Mobile-App-Integration (kann später als Sub-Projekt 5 nachgereicht werden)
- Interaktive Karten auf toenhardt.de (Leaflet/Mapbox-GL) — Static reicht
- Andere Tracking-Quellen: Komoot, Strava, Garmin GPX (separates Sub-Projekt, falls gewünscht)
- Heatmaps / kombinierte Trip-Karte über alle Tage
- Höhenprofil
- Wegpunkt-zu-Stopp-Matching (Timeline-`placeVisits` als POI-Liste in Tagesseite — könnte interessant sein, aber separat)
- Sharing der Routen als GPX-Download

---

## Offene Fragen für Jan beim Review

1. ~~**Map-Provider**~~ — ✅ ENTSCHIEDEN: OpenTopoMap self-rendered (siehe Entscheidung 3)
2. **Auto-Create-Default** — Soll der Default beim Import wirklich „neue Journal-Einträge anlegen" sein, oder zurückhaltender „nur existierende befüllen"? Siehe Entscheidung 6
3. **Walking-Behandlung** — Walking als zweite Route-Linie in anderer Farbe mitzeichnen, oder nur als Metadaten-Notiz? Siehe Entscheidung 5
4. **Bildgröße** — 800×400 (Standardwert) oder etwas anderes? Hängt vom späteren Layout in toenhardt.de ab
5. **Caption-Format** — `"Tagesroute: 245 km · 3h 12min"` oder etwas spezifischeres? z.B. „Berlin → Hamburg: 245 km, 3h 12min"? (Letzteres bräuchte Ortsnamen-Reverse-Geocoding, zusätzlicher Aufwand)
6. **Polyline-Farbe** — Vorschlag rot `#c0392b` (knallt auf Topo-Karte) — andere Präferenz?

---

## Workflow-Sequenz (visuell)

```
Handy: Maps → Timeline-Export
         ↓ (Telegram/Email/USB)
Desktop: PWA → TripPage → "🗺 Timeline importieren"
         ↓ Datei wählen
Backend: POST /timeline/preview
         → parser.ts: erkennt Format
         → splitter.ts: gruppiert nach Datum, filtert auf Trip-Range
         ← Vorschau-Liste pro Tag
PWA: Modal zeigt Liste + Checkboxen
         ↓ User wählt aus, klickt "Importieren"
Backend: POST /timeline/import
         für jeden ausgewählten Tag:
           → map.ts: Polyline encoden, Mapbox holen, PNG-Buffer
           → uploadToStrato(...) → /_entwuerfe/{tripId}/route_{date}.png
           → DB: ggf. Auto-Create journal_entry, set route_image_url + route_meta
         ← Ergebnis: erfolgreiche / fehlgeschlagene Tage
PWA: Ergebnis-Liste mit Mini-Vorschau
         ↓
Tagesseite: zeigt Karte oberhalb Blocks
         ↓ "Veröffentlichen" (Sub-Projekt 3, unverändert)
toenhardt.de: Karte als erstes Bild im Tag, Caption "245 km · 3h 12min"
```

---

## Implementierungsreihenfolge (Vorschlag für Plan-Phase)

1. Migration 007 + Schema-Update in template.ts (kompatibel, beide Spalten optional)
2. `parser.ts` mit Fixtures + Tests (kein API-Call, rein Datenstrukturen)
3. `splitter.ts` mit Tests
4. `map.ts` mit gemocktem fetch (Mapbox-Account-Setup parallel)
5. `router.ts` Preview-Route + Test
6. `router.ts` Import-Route + Test (mit gemocktem Strato + Mapbox)
7. PWA: TripPage-Button + TimelineImportModal (Schritt-für-Schritt UI)
8. PWA: JournalEntryPage Routen-Header
9. Publish-Template-Anpassung + Test
10. Manueller Live-Test mit echtem Timeline-Export
11. Doku in `.env.example`, README

---

**Ende des Entwurfs.** Wenn Jan zustimmt (oder gezielt Punkte ändert), wird daraus ein Implementierungsplan via `superpowers:writing-plans`-Skill, dann Sub-Projekt-Implementierung analog zu 1–3.
