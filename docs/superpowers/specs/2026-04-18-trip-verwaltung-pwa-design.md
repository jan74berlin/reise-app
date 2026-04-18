# Sub-Projekt 2: Trip-Verwaltung in PWA — Design

**Datum:** 2026-04-18
**Status:** Design approved, awaiting implementation plan
**Vorgänger:** Sub-Projekt 1 (Strato SFTP Foto-Upload, abgeschlossen 17.04.2026)
**Nachfolger:** Sub-Projekt 3 (HTML-Generierung + Publish nach tönhardt.de)

## Ziel

Jahres- und Trip-Verwaltung in der PWA so erweitern, dass Jan und Alicja Reisen mit vollständigen Metadaten (Titel, Zeitraum, Einführungstext) erfassen und Tagesseiten mit bewusstem Reisedatum (nicht Erfassungsdatum) anlegen können. Damit wird die Datengrundlage für Sub-Projekt 3 (Publish auf tönhardt.de) gelegt — dort werden Reisen pro Jahr mit benannter Übersicht und nach Datum geordneten Tagesseiten veröffentlicht.

## Kontext

Bestehende Live-Struktur auf `xn--tnhardt-90a.de`:
- Startseite listet benannte Reisen: "Urlaub 2025", "Sommerurlaub 2024", "Polen 2024", "Urlaub 2023", …
- Ein Jahr kann mehrere Reisen enthalten (2024: Sommer + Polen).
- Jede Reise hat eine Übersichtsseite mit Tag 1 … Tag N, die nach realem Reisedatum geordnet sind.

Die Reise-App hat das Datenmodell dafür bereits (`trips.title`, `start_date`, `end_date`, `description`), aber die PWA nutzt es bisher nicht voll: `TripsPage` hat ein einzeiliges Inline-Formular mit nur Titel, `TripPage` hat keinen Beschreibungs-Header, und Tagesseiten leiten das Datum aus `created_at` ab, was bei Nacherfassung falsch wird.

## Entscheidungen (Brainstorming)

1. **Kein Jahr-Konzept in der DB** — Jahr wird aus `trips.start_date` abgeleitet (`getFullYear()`).
2. **`trips.description` als Einführungstext** — reiner Freitext, keine strukturierten Felder (km, Statistiken etc.) in diesem Sub-Projekt.
3. **Tagesseiten-Datum** — neues `date`-Feld auf `journal_entries`, Pflicht beim Anlegen (Default heute), editierbar.
4. **Trip-Erstell-UX** — erweitertes Inline-Formular auf `TripsPage` mit Titel + Startdatum + Beschreibung in einem Schritt.
5. **Jahres-Gruppierung** — `TripsPage` zeigt Jahres-Header als Inline-Trenner (Variante B aus Frage 1), spiegelt die tönhardt.de-Struktur.
6. **Beschreibung editieren** — Stift-Icon (✏️) neben dem Text auf `TripPage` (Variante B aus Frage 2), inline textarea. Titel/Start-/Enddatum bleiben vorerst read-only in der PWA.
7. **Tagesseiten-Datum Pflicht beim Anlegen** — Inline-Datum-Picker bei "+ Neuer Tag" (Variante B aus Frage 3), Default heute, bewusste Bestätigung nötig.
8. **Trip-Anlegen Pflichtfelder** — Titel + Startdatum Pflicht, Enddatum + Beschreibung optional (Variante B aus Frage 4).

## Architektur

### Abschnitt 1 — Datenschicht

**Migration `005_journal_entry_date.sql`:**
```sql
ALTER TABLE journal_entries ADD COLUMN date DATE;
```

Nullable für Altbestand. Neue Einträge bekommen immer einen Wert (PWA setzt ihn beim Anlegen).

**Backend (`backend/src/journal/router.ts`):**
- `POST /trips/:tripId/journal` — akzeptiert `date` (ISO-Datum YYYY-MM-DD) im Body. Wenn weggelassen: `null` (für API-Kompatibilität; PWA sendet immer ein Datum).
- `PUT /journal/:id` — akzeptiert `date` als Update-Feld.
- `GET /trips/:tripId/journal` — `ORDER BY date ASC NULLS LAST, created_at ASC`. Damit landet Altbestand ohne Datum hinten und neue Einträge sind strikt chronologisch.

**Keine weiteren Backend-Änderungen.** `PUT /trips/:id` akzeptiert bereits `description`, `start_date`, `end_date`.

### Abschnitt 2 — PWA-Änderungen

**`TripsPage` (Liste):**
- Jahres-Header als Inline-Trenner. Gruppierung: `trips.reduce` nach `start_date ? new Date(start_date).getFullYear() : null`.
- Reihenfolge: Jahre absteigend; innerhalb eines Jahres `start_date` absteigend.
- Trips ohne `start_date` (nur Altbestand) → Bucket "Ohne Datum" ganz oben, visuell wie die Jahres-Header.
- "+ Neue Reise"-Inline-Formular erweitert: Titel (Pflicht, `<input>`), Startdatum (Pflicht, `<input type="date">`, Default heute), Enddatum (optional, `<input type="date">`), Beschreibung (optional, `<textarea>`, 3 Zeilen). Submit-Button disabled solange Pflichtfelder leer. Bei Submit: `POST /trips` → Trip in State einfügen → Formular schließen.

**`TripPage` (Reise-Detail):**
- Header erweitert:
  - Zurück-Pfeil + Titel (groß, read-only).
  - Datumszeile: "17.04.2026 – 09.05.2026" (read-only), wenn `end_date` fehlt "ab 17.04.2026".
  - Beschreibungs-Block darunter, editierbar via ✏️-Icon rechts.
- Leere Beschreibung → Placeholder "Beschreibung hinzufügen…" grau + ✏️ immer sichtbar.
- Edit-Modus: inline `<textarea>` ersetzt den Text, darunter Speichern / Abbrechen. Speichern ruft `PUT /trips/:id` mit `{ description }`.
- "+ Neuer Tag"-Inline-Formular: Datum-Picker (`<input type="date">`, Pflicht, Default heute) + OK/Abbrechen. Bei OK: `POST /trips/:id/journal` mit `{ blocks: [], date }` → navigate zur neuen `JournalEntryPage`.
- Tages-Label: "Tag N · 17. April", wobei N der Index in der nach `date` sortierten Liste ist (1-basiert), Datum aus `entry.date` (nicht `created_at`). Altbestand ohne `date` zeigt weiterhin `created_at`-Datum und wird am Ende gelistet.

**`JournalEntryPage` / `JournalEntryViewPage`:**
- Datum im Entry-Header editierbar via ✏️ (gleiches Muster wie Trip-Beschreibung). `PUT /journal/:id` mit `{ date }`.

**Neue Komponente `InlineEditText`:**
- Props: `value: string`, `placeholder?: string`, `onSave: (v: string) => Promise<void>`, `multiline?: boolean`.
- Read-Mode: Text + ✏️-Icon. Bei Klick auf ✏️ → Edit-Mode.
- Edit-Mode: `<input>` bzw. `<textarea>` + Speichern/Abbrechen. Während Save: Button disabled, bei Fehler: Edit-Mode bleibt offen, Fehlertext inline.
- Wiederverwendet: Trip-Beschreibung (multiline) und Entry-Datum-Wrapper (eigene Variante mit `<input type="date">`, ggf. als `InlineEditDate`, falls `multiline`-Prop nicht reicht — im Plan entscheiden).

**Bewusste Nicht-Abstraktionen:**
- `TripsPage`- und `TripPage`-Inline-Formulare bleiben lokal in ihren Seiten.
- Jahres-Gruppierung bleibt lokal in `TripsPage`, kein ausgelagertes Util.

### Abschnitt 3 — Fehler-Handling & Tests

**Fehlerfälle:**
- Pflichtfelder leer → Submit-Button disabled, kein Server-Roundtrip.
- Netzwerkfehler bei Save (Inline-Edit, Create, PUT) → Inline-Fehlermeldung, Edit-Mode bleibt offen, Werte bleiben im Feld. Kein Optimistic-Update.
- Ungültiges Datum (z.B. Enddatum < Startdatum) → Backend validiert, Frontend zeigt Fehlermeldung. Kein clientseitiger Cross-Field-Check in Sub-Projekt 2.
- Konkurrentes Editieren → Last-Write-Wins, kein Locking.

**Tests:**
- Backend: Vitest-Tests für `POST /journal` mit `date`-Feld, `PUT /journal/:id` mit `date`-Update, Sortierreihenfolge NULLS LAST. Migration `005` ins Test-DB-Setup aufnehmen.
- PWA: keine neuen automatisierten Tests — manuell gegen Live-API verifizieren (konsistent mit bisherigem PWA-Stand).

**Abnahmekriterien:**
1. Neue Reise mit Titel+Startdatum anlegen → erscheint unter richtigem Jahres-Header.
2. Beschreibung per ✏️ editieren, Reload, Text sichtbar.
3. Neuen Tag mit Datum in der Vergangenheit anlegen → korrekt einsortiert (vor heute angelegten Tagen).
4. Entry-Datum nachträglich ändern → Reihenfolge und Tag-N-Label aktualisieren sich.
5. Altbestand-Entries ohne `date` erscheinen am Ende, zeigen weiterhin `created_at`.

## Scope-Abgrenzung

**Explizit enthalten:**
- Migration 005, PWA-UI für Trip-Metadaten und Tag-Datum, `InlineEditText`-Komponente.

**Explizit nicht enthalten (kommt in Sub-Projekt 3):**
- HTML-Generierung für tönhardt.de.
- Publish-Pipeline (SFTP-Upload, Git-Commit in `jan74berlin/toenhardt`).
- Vorschau-Funktion.

**Explizit verschoben:**
- Titel / Start- / Enddatum in der PWA editieren (bleibt vorerst read-only, DB-Edit oder späteres Zahnrad-Modal).
- Strukturierte Trip-Stats (km, Länder, …).

## Offene Punkte für Implementierungsplan

- Soll `InlineEditText` für Datum eine eigene Variante `InlineEditDate` bekommen oder über `type`-Prop gelöst werden? Im Plan entscheiden.
- Exakte Styles (Farben der Jahres-Header, Icon-Farbe ✏️) — im Plan nach bestehendem `TripsPage`/`TripPage`-Look anpassen.
