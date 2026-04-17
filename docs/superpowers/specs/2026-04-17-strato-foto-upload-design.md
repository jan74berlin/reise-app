# Strato Foto-Upload Design (Sub-Projekt 1)

**Datum:** 2026-04-17  
**Status:** Genehmigt  
**Kontext:** Teil der Tönhardt.de-Publikations-Pipeline. Ersetzt Google Drive durch direkten SFTP-Upload zu Strato.

---

## Ziel

Fotos die in der PWA hochgeladen werden, landen direkt auf Strato — nicht mehr auf Google Drive. Die Dateigröße wird client-seitig auf max. 1280px / JPEG 85% reduziert (bereits implementiert). Versehentlich gelöschte Fotos können einfach neu hochgeladen werden.

---

## Architektur

```
Handy-Galerie
    │
    ▼ PWA resize (Canvas API, max 1280px, JPEG 85%)
POST /api/v1/trips/:tripId/journal/:entryId/media
    │
    ▼ Backend
ssh2-sftp-client → Strato SFTP
    /_entwuerfe/{tripId}/{uuid}.jpg
    │
    ▼
DB: media.file_path, media.url
    │
    ▼ PWA zeigt Foto sofort
https://xn--tnhardt-90a.de/_entwuerfe/{tripId}/{uuid}.jpg
```

---

## Strato SFTP

- **Server:** `5397472.ssh.w1.strato.hosting`
- **User:** `stu935406240`
- **Passwort:** Umgebungsvariable `STRATO_SFTP_PASSWORD`
- **Arbeitsordner:** `/_entwuerfe/{tripId}/`
- **Öffentliche URL:** `https://xn--tnhardt-90a.de/_entwuerfe/{tripId}/{uuid}.jpg`
- **Directory-Listing:** deaktiviert via `.htaccess` (`Options -Indexes`) im `/_entwuerfe/`-Ordner

---

## Backend-Änderungen

### Neue Datei: `backend/src/strato.ts`

Exportiert:
- `uploadToStrato(tripId: string, filename: string, buffer: Buffer, mimetype: string): Promise<{ filePath: string; url: string }>`
- `deleteFromStrato(filePath: string): Promise<void>`

Verwendet `ssh2-sftp-client`. Verbindung wird pro Aufruf geöffnet und geschlossen (kein Connection-Pool nötig bei geringer Last).

### Gelöschte Datei: `backend/src/drive.ts`

Wird vollständig entfernt (Google Drive nicht mehr verwendet).

### Geänderte Datei: `backend/src/journal/router.ts`

- `uploadToDrive()` → `uploadToStrato()`
- `deleteDriveFile()` → `deleteFromStrato()`
- Fehlerbehandlung bleibt gleich (Kompensation bei DB-Fehler nach Upload)

### Migration: `backend/migrations/004_media_strato.sql`

```sql
ALTER TABLE media
  RENAME COLUMN drive_file_id TO file_path;
ALTER TABLE media
  RENAME COLUMN drive_view_url TO url;
```

Generische Spaltennamen (nicht Drive-spezifisch) für spätere Flexibilität.

### Umgebungsvariable (`.env`)

```
STRATO_SFTP_HOST=5397472.ssh.w1.strato.hosting
STRATO_SFTP_USER=stu935406240
STRATO_SFTP_PASSWORD=#Jan74berlin
STRATO_BASE_URL=https://xn--tnhardt-90a.de
```

---

## PWA-Änderungen

### `pwa/src/types.ts`

`Media`-Typ: `drive_file_id` / `drive_view_url` → `file_path` / `url`

### `pwa/src/api/journal.ts`

`uploadMedia()` bleibt gleich (schickt FormData, bekommt `media`-Objekt zurück).  
Referenzen auf `drive_view_url` → `url` aktualisieren.

---

## Strato-Vorbereitung

Per SFTP einmalig anlegen:
```
/_entwuerfe/.htaccess   →  Options -Indexes
```

---

## Bewusst nicht in Scope

- Aufräumen des Arbeitsordners nach Veröffentlichung (kommt in Sub-Projekt 3)
- Fotos werden nie aus `/_entwuerfe/` in finale Ordner verschoben (das ist Sub-Projekt 3)
- Kein Passwortschutz auf `/_entwuerfe/` — Ordner-URL ist nicht erratbar (UUID-basiert)
