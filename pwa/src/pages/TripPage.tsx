import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTrips } from '../api/trips';
import { getEntries, createEntry } from '../api/journal';
import ModeToggle from '../components/ModeToggle';
import type { Trip, JournalEntry } from '../types';

export default function TripPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getTrips(), getEntries(tripId!)]).then(([{ trips }, { entries }]) => {
      setTrip(trips.find(t => t.id === tripId) ?? null);
      setEntries(entries);
    }).finally(() => setLoading(false));
  }, [tripId]);

  async function handleNewEntry() {
    const { entry } = await createEntry(tripId!, { blocks: [] });
    navigate(`/trips/${tripId}/journal/${entry.id}`);
  }

  function getThumbnail(entry: JournalEntry): string | null {
    const firstImgBlock = entry.blocks?.find(b => b.type === 'images');
    if (firstImgBlock && firstImgBlock.type === 'images' && firstImgBlock.media_ids.length > 0) {
      const media = entry.media.find(m => m.id === firstImgBlock.media_ids[0]);
      return media?.drive_view_url ?? null;
    }
    return entry.media[0]?.drive_view_url ?? null;
  }

  function getPhotoCount(entry: JournalEntry): number {
    return entry.media.length;
  }

  if (loading) return <div style={{ padding: 32 }}>Lade…</div>;

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
          <h1 style={{ margin: 0, fontSize: 18 }}>{trip?.title ?? 'Reise'}</h1>
        </div>
        <ModeToggle />
      </div>

      {entries.map((entry, i) => {
        const thumb = getThumbnail(entry);
        const photoCount = getPhotoCount(entry);
        const date = new Date(entry.created_at).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
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

      <button onClick={handleNewEntry}
        style={{ marginTop: 12, padding: '10px 16px', borderRadius: 8, border: '2px dashed #4a90e2', background: '#f0f6ff', color: '#4a90e2', cursor: 'pointer', fontSize: 14, width: '100%' }}>
        + Neuer Tag
      </button>
    </div>
  );
}
