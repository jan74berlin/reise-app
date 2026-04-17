# Tagebuch-PWA Design

**Datum:** 2026-04-17  
**Status:** Genehmigt

## Zusammenfassung

Eine Progressive Web App (PWA) als Reisetagebuch für Jan & Alicja. Zwei Modi: ein schlanker Handy-Upload-Modus und ein vollständiger Desktop-Editor. Die App kommuniziert ausschließlich mit dem bestehenden Backend auf `api.jan-toenhardt.de`. Sie wird später als Basis für die React Native Reise-App (Phase 2) dienen.

---

## Ziele

- Auf Reise: Fotos vom Handy in 3 Taps hochladen und einem Reisetag zuordnen
- Zuhause/Laptop: Tagesseiten mit gemischten Text- und Bild-Blöcken erstellen und bearbeiten
- Eigenständige App zuerst, später Integration in React Native Reise-App

---

## Architektur

```
[PWA: Vite + React]
  Browser (Handy + Desktop)
       |
       | HTTPS (JWT Bearer)
       ▼
[api.jan-toenhardt.de → LXC 111]
  bestehende REST-API
  + neue blocks-Spalte in journal_entries
       |
       ▼
[Nginx auf LXC 111]
  statische PWA-Dateien unter tagebuch.jan-toenhardt.de
```

**Stack:**
- Vite + React (TypeScript)
- SortableJS für Drag & Drop (touch-optimiert)
- Canvas API für client-seitige Bildverkleinerung
- Kein zusätzlicher State-Manager — React useState/useContext reicht

**Hosting:** Statische Build-Artefakte werden auf LXC 111 unter `/var/www/tagebuch/` abgelegt und per Nginx ausgeliefert. Cloudflare Tunnel `tagebuch.jan-toenhardt.de` wird analog zu `api.toenhardt.de` eingerichtet.

---

## Zwei Modi

Der aktive Modus wird in `localStorage` gespeichert. Auf Bildschirmen unter 768px Breite wird automatisch der Handy-Modus aktiviert.

### Handy-Modus (📱)

Fokussiert auf schnellen Upload während der Reise.

**Flow:**
1. Reise aus Dropdown wählen (oder neu anlegen)
2. Tag aus Dropdown wählen (oder neu anlegen mit Datum)
3. Großen Upload-Bereich antippen → Galerie öffnet sich (Mehrfachauswahl)
4. Vorschau-Thumbnails erscheinen sofort
5. „Hochladen"-Button → Fotos werden verarbeitet und hochgeladen
6. Fortschrittsbalken pro Foto, Erfolgsmeldung am Ende

**Kein Texteditor, keine Blöcke** — nur Upload. Text kann später im Desktop-Modus ergänzt werden.

### Desktop-Modus (🖥)

Vollständiger Seiteneditor für strukturierte Tagesberichte.

**Layout:** Zweispaltig — links schmale Seitenleiste mit Tagesliste, rechts Block-Editor.

**Block-Typen:**
- **Text-Block:** Mehrzeiliges Textfeld, beliebig lang
- **Bild-Block:** Ein oder mehrere Fotos (Galerie-Zeile), neue Fotos können jederzeit hinzugefügt werden

**Drag & Drop:** Jeder Block hat einen Griff (⠿) links. Langer Druck auf Handy, normales Ziehen auf Desktop. Reihenfolge wird beim Speichern im `blocks`-Array persistiert.

**Aktionen pro Block:**
- Verschieben (Drag & Drop)
- Löschen (✕-Button)
- Bei Bild-Block: weitere Fotos hinzufügen

---

## Screens

| Screen | Route | Beschreibung |
|---|---|---|
| Login | `/login` | E-Mail + Passwort, JWT in localStorage |
| Reisen-Liste | `/` | Alle Reisen der Familie, „+ Neue Reise"-Button |
| Tages-Liste | `/trips/:id` | Alle Tageseinträge einer Reise mit Vorschau-Thumbnail und Foto-Anzahl |
| Tageseintrag | `/trips/:id/journal/:entryId` | Editor (Desktop-Modus) oder Upload-Ansicht (Handy-Modus) |
| Leseansicht | `/trips/:id/journal/:entryId/view` | Gerenderte Tagesseite mit Lightbox für Fotos |

---

## Foto-Upload-Flow

1. `<input type="file" multiple accept="image/*">` öffnet die Galerie
2. Für jedes gewählte Bild: Canvas API skaliert auf max. 1280px Breite, JPEG-Qualität 85%
3. Upload per `POST /trips/:id/journal/:entryId/media` (Multipart/form-data)
4. Response enthält `media_id` und öffentliche URL (`https://api.jan-toenhardt.de/uploads/<uuid>.jpg`)
5. Im Desktop-Modus: `media_id` wird in den aktiven Bild-Block eingefügt
6. Im Handy-Modus: alle hochgeladenen Fotos landen in einem automatisch angelegten Bild-Block

---

## Backend-Erweiterung

### Migration

```sql
ALTER TABLE journal_entries
  ADD COLUMN blocks JSONB;
```

Bestehende Einträge behalten `blocks = NULL` — die API behandelt das wie einen einzelnen Text-Block mit dem bestehenden `text`-Feld. Neue Einträge nutzen ausschließlich `blocks`.

### Blocks-Format

```json
[
  { "type": "text", "content": "Heute morgen Sonnenschein über der Bucht..." },
  { "type": "images", "media_ids": ["uuid-1", "uuid-2", "uuid-3"] },
  { "type": "text", "content": "Am Nachmittag weiter Richtung Klaipeda..." },
  { "type": "images", "media_ids": ["uuid-4"] }
]
```

### API-Änderungen

- `POST /trips/:id/journal` — nimmt optional `blocks` entgegen (neben `text`)
- `PUT /trips/:id/journal/:entryId` — aktualisiert `blocks` (beim Speichern des Editors)
- `GET /trips/:id/journal` — gibt `blocks` zurück (neben bestehenden Feldern)

---

## Datei-Struktur (PWA)

```
reise-app/
  pwa/
    src/
      api/          — Fetch-Wrapper für api.toenhardt.de
      components/
        BlockEditor/  — Drag & Drop Block-Editor
        PhotoUpload/  — Galerie-Auswahl + Canvas-Resize + Upload
        Lightbox/     — Vollbild-Fotoansicht
        ModeToggle/   — 📱/🖥 Umschalter
      pages/
        LoginPage.tsx
        TripsPage.tsx
        TripPage.tsx
        JournalEntryPage.tsx
        JournalEntryViewPage.tsx
      App.tsx
      main.tsx
    public/
      manifest.json   — PWA-Manifest (Icon, Name, display: standalone)
    index.html
    vite.config.ts
```

---

## Deployment

```bash
cd pwa && npm run build
# Artefakte in pwa/dist/ → auf LXC 111 nach /var/www/tagebuch/ kopieren
rsync -av dist/ root@100.84.90.104:/var/www/tagebuch/
```

Nginx-Config auf LXC 111:
```nginx
server {
  listen 80;
  server_name tagebuch.jan-toenhardt.de;
  root /var/www/tagebuch;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

Cloudflare Tunnel: neuer Eintrag `tagebuch.jan-toenhardt.de → localhost:80` (analog zu api.toenhardt.de).

---

## Bewusst nicht in Scope

- Offline-Modus (kommt in der React Native App)
- Stellplatz-Planung / Karte (nur Tagebuch)
- Kommentare / Teilen-Funktion
- Multi-Tenant-Registrierung (nur Jan + Alicja)
