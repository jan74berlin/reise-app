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
