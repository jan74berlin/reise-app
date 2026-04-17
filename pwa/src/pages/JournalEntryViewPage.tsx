import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getEntries } from '../api/journal';
import Lightbox from '../components/Lightbox';
import type { JournalEntry, Block } from '../types';

export default function JournalEntryViewPage() {
  const { tripId, entryId } = useParams<{ tripId: string; entryId: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    getEntries(tripId!).then(({ entries }) => {
      setEntry(entries.find(e => e.id === entryId) ?? null);
    });
  }, [tripId, entryId]);

  if (!entry) return <div style={{ padding: 32 }}>Lade…</div>;

  const blocks: Block[] = entry.blocks?.length
    ? entry.blocks
    : entry.text
    ? [{ type: 'text', content: entry.text }]
    : [];

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={() => navigate(`/trips/${tripId}`)}
          style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
        <h2 style={{ margin: 0 }}>
          {new Date(entry.created_at).toLocaleDateString('de-DE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </h2>
        <button onClick={() => navigate(`/trips/${tripId}/journal/${entryId}`)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
          ✏️ Bearbeiten
        </button>
      </div>

      {blocks.map((block, i) => {
        if (block.type === 'text') {
          return (
            <p key={i} style={{ fontSize: 16, lineHeight: 1.7, color: '#333', marginBottom: 20, whiteSpace: 'pre-wrap' }}>
              {block.content}
            </p>
          );
        }
        const images = block.media_ids
          .map(id => entry.media.find(m => m.id === id))
          .filter((m): m is NonNullable<typeof m> => m != null);
        return (
          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {images.map(media => (
              <img
                key={media.id}
                src={media.drive_view_url}
                alt=""
                onClick={() => setLightbox(media.drive_view_url)}
                style={{ height: 180, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flex: '1 1 200px', maxWidth: '100%' }}
              />
            ))}
          </div>
        );
      })}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
