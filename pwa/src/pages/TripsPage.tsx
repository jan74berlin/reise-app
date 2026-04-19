import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrips, createTrip, updateTrip } from '../api/trips';
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
            <TripCard
              key={t.id}
              trip={t}
              onOpen={() => navigate(`/trips/${t.id}`)}
              onRename={async (v) => {
                const { trip: updated } = await updateTrip(t.id, { title: v });
                setTrips(prev => prev.map(x => x.id === t.id ? updated : x));
              }}
            />
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

function TripCard({ trip, onOpen, onRename }: { trip: Trip; onOpen: () => void; onRename: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(trip.title);
  const [saving, setSaving] = useState(false);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(trip.title);
    setEditing(true);
  }
  async function save(e?: React.MouseEvent | React.FormEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    const v = draft.trim();
    if (!v || saving) return;
    setSaving(true);
    try {
      await onRename(v);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }
  function cancel(e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(false);
  }

  return (
    <div onClick={editing ? undefined : onOpen}
      style={{ background: '#f5f7fa', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: editing ? 'default' : 'pointer', borderLeft: '4px solid #4a90e2', display: 'flex', alignItems: 'center', gap: 10 }}>
      {editing ? (
        <form onSubmit={save} style={{ flex: 1, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 15 }} />
          <button type="submit" disabled={saving || !draft.trim()}
            style={{ padding: '6px 12px', borderRadius: 6, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer' }}>
            {saving ? '…' : '✓'}
          </button>
          <button type="button" onClick={cancel}
            style={{ padding: '6px 10px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>✕</button>
        </form>
      ) : (
        <>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{trip.title}</div>
            {trip.start_date && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{trip.start_date} – {trip.end_date ?? '?'}</div>}
          </div>
          <button onClick={startEdit} aria-label="Umbenennen"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 4 }}>✏️</button>
        </>
      )}
    </div>
  );
}
