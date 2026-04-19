import { useState } from 'react';
import { previewTimeline, importTimeline } from '../api/timeline';
import type { TimelinePreviewResponse, TimelinePreviewDay, TimelineImportResult } from '../types';

interface Props {
  tripId: string;
  onClose(): void;
  onDone(result: TimelineImportResult): void;
}

type Stage = 'pick' | 'analyzing' | 'preview' | 'importing' | 'result';

export default function TimelineImportModal({ tripId, onClose, onDone }: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<TimelinePreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState<Record<string, boolean>>({});
  const [autoCreate, setAutoCreate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TimelineImportResult | null>(null);
  const [uploadPct, setUploadPct] = useState(0);

  async function handlePick(f: File) {
    setFile(f); setError(null);
    setUploadPct(0);
    setStage('analyzing');
    try {
      const p = await previewTimeline(tripId, f, setUploadPct);
      setPreview(p);
      const sel = new Set(p.days.filter(d => d.has_motorized).map(d => d.date));
      setSelected(sel);
      setStage('preview');
    } catch (e) { setError((e as Error).message); setStage('pick'); }
  }

  async function handleImport() {
    if (!file || !preview) return;
    setUploadPct(0);
    setStage('importing'); setError(null);
    try {
      const r = await importTimeline(tripId, file, [...selected], overwrite, autoCreate, setUploadPct);
      setResult(r);
      setStage('result');
      onDone(r);
    } catch (e) { setError((e as Error).message); setStage('preview'); }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <button onClick={onClose} style={closeBtn} aria-label="Schließen">×</button>
        <h2 style={{ marginTop: 0 }}>🗺 Timeline importieren</h2>

        {stage === 'pick' && (
          <div>
            <p style={{ color: '#555', fontSize: 14 }}>
              Lade die <code>Timeline.json</code> aus Google Maps hoch
              (Handy: Google Maps → Profilbild → Einstellungen → Persönliche Inhalte → „Zeitachsen-Daten exportieren").
              Auf dem Handy kannst du die Datei direkt aus dem Download-Ordner picken.
            </p>
            <input type="file" accept="application/json,.json" onChange={e => {
              const f = e.target.files?.[0]; if (f) handlePick(f);
            }} style={{ padding: 10, border: '2px dashed #aaa', borderRadius: 8, width: '100%', cursor: 'pointer' }} />
            {error && <div style={errStyle}>{error}</div>}
          </div>
        )}

        {stage === 'preview' && preview && (
          <div>
            <p style={{ color: '#555', fontSize: 13 }}>
              Trip-Zeitraum: {preview.trip_start} bis {preview.trip_end}.
              Gefunden: {preview.days.length} Tage mit Bewegungsdaten.
              {preview.skipped_outside_range.length > 0 && ` (${preview.skipped_outside_range.length} Tage außerhalb übersprungen.)`}
            </p>
            <label style={{ display: 'block', margin: '10px 0', fontSize: 13 }}>
              <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} />
              {' '}Auto-Create für fehlende Tage (empfohlen)
            </label>
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
              {preview.days.map(d => <DayRow key={d.date} d={d} selected={selected} setSelected={setSelected} overwrite={overwrite} setOverwrite={setOverwrite} />)}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button onClick={() => setStage('pick')} style={btnSecondary}>Zurück</button>
              <button onClick={handleImport} disabled={selected.size === 0} style={btnPrimary}>
                {selected.size} Tage importieren
              </button>
            </div>
            {error && <div style={errStyle}>{error}</div>}
          </div>
        )}

        {stage === 'analyzing' && (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              {uploadPct < 100 ? '📤 Lade Timeline-Daten hoch …' : '⚙️ Backend analysiert die Zeitachse …'}
            </p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Datei: <code>{file?.name}</code> ({file ? Math.round(file.size / 1024 / 1024 * 10) / 10 : 0} MB)
            </p>
            <ProgressBar pct={uploadPct} indeterminate={uploadPct >= 100} />
            <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
              {uploadPct < 100 ? `${uploadPct}% hochgeladen` : 'Parsen + Gruppieren der Segmente kann 10–30 s dauern'}
            </p>
          </div>
        )}

        {stage === 'importing' && (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              {uploadPct < 100
                ? `📤 Lade Timeline-Daten hoch …`
                : `🗺 Rendere ${selected.size} Karten …`}
            </p>
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {uploadPct >= 100 && 'Pro Tag werden OpenTopoMap-Tiles geladen + Karte komponiert. Plan ~5–15 s pro Tag.'}
            </p>
            <ProgressBar pct={uploadPct} indeterminate={uploadPct >= 100} />
            <p style={{ fontSize: 12, color: '#888', marginTop: 12 }}>
              {uploadPct < 100 ? `${uploadPct}% hochgeladen` : 'Bitte warten — Backend arbeitet'}
            </p>
          </div>
        )}

        {stage === 'result' && result && (
          <div>
            <h3>Ergebnis</h3>
            <p>✅ {result.processed.length} Tage importiert · ⏭ {result.skipped.length} übersprungen · ⚠ {result.errors.length} Fehler</p>
            {result.overview_url && <p>🗺 Trip-Übersichtskarte aktualisiert</p>}
            {result.processed.slice(0, 5).map(p => (
              <div key={p.date} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <img src={p.route_image_url} style={{ width: 100, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                <span style={{ fontSize: 13 }}>{p.date}: {p.meta.distance_km} km{p.created ? ' (neu erstellt)' : ''}</span>
              </div>
            ))}
            <button onClick={onClose} style={{ ...btnPrimary, marginTop: 14 }}>Fertig</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ pct, indeterminate }: { pct: number; indeterminate: boolean }) {
  return (
    <div style={{ width: '100%', height: 16, background: '#eee', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
      {indeterminate ? (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, transparent, #1976d2, transparent)',
          backgroundSize: '50% 100%',
          animation: 'tlImportShimmer 1.4s linear infinite',
        }} />
      ) : (
        <div style={{
          width: `${pct}%`, height: '100%',
          background: '#1976d2',
          transition: 'width 0.2s ease',
        }} />
      )}
      <style>{'@keyframes tlImportShimmer { 0% { background-position: -100% 0; } 100% { background-position: 200% 0; } }'}</style>
    </div>
  );
}

function DayRow({ d, selected, setSelected, overwrite, setOverwrite }: {
  d: TimelinePreviewDay;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  overwrite: Record<string, boolean>;
  setOverwrite: (o: Record<string, boolean>) => void;
}) {
  const isSelected = selected.has(d.date);
  const isStandtag = !d.has_motorized;
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>
      <input
        type="checkbox"
        checked={isSelected}
        disabled={isStandtag}
        onChange={() => {
          const ns = new Set(selected);
          if (ns.has(d.date)) ns.delete(d.date); else ns.add(d.date);
          setSelected(ns);
        }}
        style={{ marginRight: 10 }}
      />
      <div style={{ flex: 1 }}>
        <strong>{d.date}</strong>
        {isStandtag ? <span style={{ color: '#999', marginLeft: 8 }}>Standtag (kein Womo)</span>
          : <span style={{ marginLeft: 8 }}>{d.distance_km} km · {d.modes.join(', ')}</span>}
      </div>
      {d.has_existing_route_image && (
        <label style={{ fontSize: 12, color: '#c0392b' }}>
          <input type="checkbox" checked={!!overwrite[d.date]} onChange={e => {
            const o = { ...overwrite }; o[d.date] = e.target.checked; setOverwrite(o);
          }} /> Überschreiben
        </label>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 8, padding: 24, maxWidth: 720, width: '90vw', maxHeight: '90vh', overflowY: 'auto', position: 'relative' };
const closeBtn: React.CSSProperties = { position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#666' };
const btnPrimary: React.CSSProperties = { padding: '10px 18px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '10px 18px', background: '#eee', color: '#333', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const errStyle: React.CSSProperties = { color: '#c00', marginTop: 10, padding: 10, background: '#fee', borderRadius: 6, fontSize: 13 };
