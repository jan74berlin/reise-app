import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sortable from 'sortablejs';
import { getEntries, updateEntry, deleteMedia } from '../api/journal';
import { useMode } from '../contexts/ModeContext';
import ModeToggle from '../components/ModeToggle';
import PhotoUpload from '../components/PhotoUpload';
import type { JournalEntry, Block } from '../types';

export default function JournalEntryPage() {
  const { tripId, entryId } = useParams<{ tripId: string; entryId: string }>();
  const navigate = useNavigate();
  const { mode } = useMode();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getEntries(tripId!).then(({ entries }) => {
      const e = entries.find(x => x.id === entryId);
      if (e) { setEntry(e); setBlocks(e.blocks ?? []); }
    });
  }, [tripId, entryId]);

  // SortableJS nur im Desktop-Modus
  useEffect(() => {
    if (mode !== 'desktop' || !blocksRef.current) return;
    const sortable = Sortable.create(blocksRef.current, {
      animation: 150,
      handle: '.drag-handle',
      onEnd: (evt) => {
        if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
        setBlocks(prev => {
          const next = [...prev];
          const [moved] = next.splice(evt.oldIndex!, 1);
          next.splice(evt.newIndex!, 0, moved);
          return next;
        });
      },
    });
    return () => sortable.destroy();
  }, [mode, blocks.length]);

  async function save(blocksToSave?: Block[]) {
    if (!tripId || !entryId) return;
    setSaving(true);
    try {
      await updateEntry(tripId, entryId, { blocks: blocksToSave ?? blocks });
    } finally {
      setSaving(false);
    }
  }

  function addTextBlock() {
    setBlocks(b => [...b, { type: 'text', content: '' }]);
  }

  function addImageBlock() {
    setBlocks(b => [...b, { type: 'images', media_ids: [] }]);
  }

  function updateTextBlock(i: number, content: string) {
    setBlocks(b => b.map((block, j) => j === i ? { type: 'text', content } : block));
  }

  function removeBlock(i: number) {
    setBlocks(b => b.filter((_, j) => j !== i));
  }

  function moveBlock(i: number, dir: -1 | 1) {
    setBlocks(b => {
      const next = [...b];
      const target = i + dir;
      if (target < 0 || target >= next.length) return next;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  function onMediaUploaded(blockIndex: number, mediaId: string) {
    setBlocks(b => b.map((block, j) => {
      if (j !== blockIndex || block.type !== 'images') return block;
      return { type: 'images', media_ids: [...block.media_ids, mediaId] };
    }));
  }

  // Mobile mode: save after each upload using callback form to avoid stale closure
  function onMobileUploaded(mediaId: string) {
    setBlocks(prevBlocks => {
      const lastImgIdx = prevBlocks.map((b, i) => b.type === 'images' ? i : -1).filter(i => i >= 0).pop();
      const newBlocks: Block[] = lastImgIdx !== undefined
        ? prevBlocks.map((block, j) => {
            if (j !== lastImgIdx || block.type !== 'images') return block;
            return { type: 'images', media_ids: [...block.media_ids, mediaId] };
          })
        : [...prevBlocks, { type: 'images', media_ids: [mediaId] }];
      updateEntry(tripId!, entryId!, { blocks: newBlocks }).catch(() => {});
      return newBlocks;
    });
  }

  if (!entry) return <div style={{ padding: 32 }}>Lade…</div>;

  // ── HANDY-MODUS ──────────────────────────────────────────────────────
  if (mode === 'mobile') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => navigate(`/trips/${tripId}`)}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>←</button>
            <h1 style={{ margin: 0, fontSize: 18 }}>Fotos hochladen</h1>
          </div>
          <ModeToggle />
        </div>

        <PhotoUpload
          tripId={tripId!}
          entryId={entryId!}
          onUploaded={(id) => onMobileUploaded(id)}
        />

        <button
          onClick={() => navigate(`/trips/${tripId}/journal/${entryId}/view`)}
          style={{ marginTop: 20, width: '100%', padding: 12, borderRadius: 8, background: '#f5f7fa', border: '1px solid #ddd', cursor: 'pointer', fontSize: 14 }}>
          Eintrag ansehen →
        </button>
      </div>
    );
  }

  // ── DESKTOP-MODUS ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 180, borderRight: '1px solid #e0e0e0', padding: 12, overflowY: 'auto', flexShrink: 0 }}>
        <button onClick={() => navigate(`/trips/${tripId}`)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#4a90e2', marginBottom: 12 }}>
          ← Zurück
        </button>
        <div style={{ fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 8 }}>BLÖCKE</div>
        <div style={{ fontSize: 13, color: '#555' }}>{blocks.length} Block{blocks.length !== 1 ? 'e' : ''}</div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0 }}>
            {new Date(entry.created_at).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <ModeToggle />
            <button onClick={() => navigate(`/trips/${tripId}/journal/${entryId}/view`)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
              👁 Ansehen
            </button>
            <button onClick={() => save()} disabled={saving}
              style={{ padding: '6px 14px', borderRadius: 6, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}>
              {saving ? 'Speichere…' : '💾 Speichern'}
            </button>
          </div>
        </div>

        <div ref={blocksRef} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {blocks.map((block, i) => (
            <div key={i}
              style={{ background: block.type === 'text' ? '#e8f0fe' : '#f0f8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span className="drag-handle"
                style={{ cursor: 'grab', color: '#bbb', fontSize: 18, userSelect: 'none', flexShrink: 0, lineHeight: 1 }}>⠿</span>

              <div style={{ flex: 1 }}>
                {block.type === 'text' ? (
                  <textarea
                    value={block.content}
                    onChange={e => updateTextBlock(i, e.target.value)}
                    placeholder="Text eingeben…"
                    style={{ width: '100%', minHeight: 80, border: 'none', background: 'transparent', resize: 'vertical', fontSize: 15, outline: 'none', fontFamily: 'inherit' }}
                  />
                ) : (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {block.media_ids.map(id => {
                        const media = entry.media.find(m => m.id === id);
                        return media ? (
                          <div key={id} style={{ position: 'relative' }}>
                            <img src={media.drive_view_url} alt=""
                              style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} />
                            <button
                              onClick={async () => {
                                await deleteMedia(tripId!, entryId!, id);
                                setBlocks(b => b.map((bl, j) =>
                                  j !== i || bl.type !== 'images' ? bl
                                    : { type: 'images', media_ids: bl.media_ids.filter(x => x !== id) }
                                ));
                              }}
                              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>
                              ✕
                            </button>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <PhotoUpload
                      tripId={tripId!}
                      entryId={entryId!}
                      onUploaded={(id) => onMediaUploaded(i, id)}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                <button onClick={() => moveBlock(i, -1)} style={btnStyle}>▲</button>
                <button onClick={() => moveBlock(i, 1)} style={btnStyle}>▼</button>
                <button onClick={() => removeBlock(i)} style={{ ...btnStyle, color: '#c00' }}>✕</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={addTextBlock} style={addBtnStyle}>+ Text</button>
          <button onClick={addImageBlock} style={addBtnStyle}>+ Fotos</button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer',
};
const addBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px dashed #aaa', background: '#f9f9f9', cursor: 'pointer', fontSize: 14,
};
