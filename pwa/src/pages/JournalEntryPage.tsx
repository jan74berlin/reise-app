import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Sortable from 'sortablejs';
import { getEntries, updateEntry, deleteMedia } from '../api/journal';
import { getTrips } from '../api/trips';
import { previewEntry, publishEntry, unpublishEntry } from '../api/publish';
import { useMode } from '../contexts/ModeContext';
import ModeToggle from '../components/ModeToggle';
import PhotoUpload from '../components/PhotoUpload';
import InlineEditText from '../components/InlineEditText';
import { normalizeBlocks } from '../utils/normalizeBlocks';
import type { JournalEntry, Block } from '../types';

export default function JournalEntryPage() {
  const { tripId, entryId } = useParams<{ tripId: string; entryId: string }>();
  const navigate = useNavigate();
  const { mode } = useMode();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [tripSlug, setTripSlug] = useState<string | null>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getEntries(tripId!).then(({ entries }) => {
      const e = entries.find(x => x.id === entryId);
      if (e) { setEntry(e); setBlocks(normalizeBlocks(e)); }
    });
    getTrips().then(({ trips }) => setTripSlug(trips.find(t => t.id === tripId)?.slug ?? null));
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

  async function handlePreview() {
    if (!entry) return;
    const { preview } = await previewEntry(tripId!, entry.id);
    const p = preview as { title: string; date: string; paragraphs: string[]; images: string[] };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;max-width:720px;margin:2rem auto;padding:1rem;color:#333}
      h1{font-size:1.8rem;margin-bottom:.3rem}
      .date{color:#888;margin-bottom:1.5rem}
      p{line-height:1.7;margin-bottom:1rem;white-space:pre-wrap}
      .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.6rem;margin:1rem 0}
      .gallery img{width:100%;height:160px;object-fit:cover;border-radius:6px}
    </style></head><body>
      <h1>${p.title}</h1>
      <div class="date">${p.date ?? ''}</div>
      ${p.paragraphs.map(t => `<p>${t.replace(/</g, '&lt;')}</p>`).join('')}
      ${p.images.length ? `<div class="gallery">${p.images.map(u => `<img src="${u}">`).join('')}</div>` : ''}
    </body></html>`;
    setPreviewHtml(html);
  }

  async function handlePublishToggle() {
    if (!entry || publishing) return;
    setPublishing(true);
    try {
      if (entry.is_published) {
        await unpublishEntry(tripId!, entry.id);
        setEntry({ ...entry, is_published: false });
      } else {
        const r = await publishEntry(tripId!, entry.id);
        setEntry({ ...entry, is_published: true, publish_seq: r.publish_seq, first_published_at: r.first_published_at });
      }
    } catch (e) {
      alert('Fehler: ' + (e instanceof Error ? e.message : 'unbekannt'));
    } finally {
      setPublishing(false);
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

  function moveMediaBetweenBlocks(fromBlock: number, toBlock: number, mediaId: string, toIndex: number) {
    setBlocks(prev => prev.map((bl, j) => {
      if (bl.type !== 'images') return bl;
      if (j === fromBlock && j === toBlock) {
        const filtered = bl.media_ids.filter(id => id !== mediaId);
        filtered.splice(toIndex, 0, mediaId);
        return { type: 'images', media_ids: filtered };
      }
      if (j === fromBlock) {
        return { type: 'images', media_ids: bl.media_ids.filter(id => id !== mediaId) };
      }
      if (j === toBlock) {
        const next = [...bl.media_ids];
        next.splice(toIndex, 0, mediaId);
        return { type: 'images', media_ids: next };
      }
      return bl;
    }));
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
          <div style={{ margin: 0, minWidth: 240 }}>
            <InlineEditText
              value={entry.date ?? ''}
              placeholder="Datum setzen"
              inputType="date"
              onSave={async (v) => {
                const { entry: updated } = await updateEntry(tripId!, entryId!, { date: v });
                setEntry(updated);
                if (updated.blocks) setBlocks(updated.blocks);
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <ModeToggle />
            <button onClick={() => navigate(`/trips/${tripId}/journal/${entryId}/view`)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
              👁 Ansehen
            </button>
            <button onClick={handlePreview} disabled={publishing}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
              👁 Vorschau
            </button>
            <button onClick={handlePublishToggle} disabled={publishing}
              style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: entry.is_published ? '#2a9d4a' : '#e8a838', color: '#fff', cursor: 'pointer', fontSize: 13 }}>
              {publishing ? '…' : entry.is_published ? '🟢 Online' : '📤 Veröffentlichen'}
            </button>
            {tripSlug && entry.is_published && entry.publish_seq && (
              <a href={`https://xn--tnhardt-90a.de/#${tripSlug}/tag-${entry.publish_seq}`}
                 target="_blank" rel="noopener noreferrer"
                 style={{ fontSize: 12, color: '#4a90e2', alignSelf: 'center', marginLeft: 4 }}>
                Ansehen ↗
              </a>
            )}
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
                    <ImageGrid
                      blockIndex={i}
                      mediaIds={block.media_ids}
                      entry={entry}
                      onMove={moveMediaBetweenBlocks}
                      onDelete={async (id) => {
                        await deleteMedia(tripId!, entryId!, id);
                        setBlocks(b => b.map((bl, j) =>
                          j !== i || bl.type !== 'images' ? bl
                            : { type: 'images', media_ids: bl.media_ids.filter(x => x !== id) }
                        ));
                      }}
                    />
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

      {previewHtml && (
        <div onClick={() => setPreviewHtml(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 8, width: 'min(800px, 100%)', height: 'min(80vh, 90%)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Vorschau</strong>
              <button onClick={() => setPreviewHtml(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <iframe srcDoc={previewHtml} style={{ flex: 1, border: 'none', borderRadius: '0 0 8px 8px' }} />
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  fontSize: 11, padding: '3px 6px', border: '1px solid #ddd', borderRadius: 4, background: '#fff', cursor: 'pointer',
};
const addBtnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: '1px dashed #aaa', background: '#f9f9f9', cursor: 'pointer', fontSize: 14,
};

function ImageGrid({ blockIndex, mediaIds, entry, onMove, onDelete }: {
  blockIndex: number;
  mediaIds: string[];
  entry: JournalEntry;
  onMove: (fromBlock: number, toBlock: number, mediaId: string, toIndex: number) => void;
  onDelete: (id: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  useEffect(() => {
    if (!gridRef.current) return;
    const s = Sortable.create(gridRef.current, {
      group: 'media',
      animation: 150,
      onEnd: (evt) => {
        if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
        const fromBlock = Number((evt.from as HTMLElement).dataset.block);
        const toBlock = Number((evt.to as HTMLElement).dataset.block);
        const mediaId = (evt.item as HTMLElement).dataset.id;
        if (!mediaId || Number.isNaN(fromBlock) || Number.isNaN(toBlock)) return;
        if (fromBlock === toBlock && evt.oldIndex === evt.newIndex) return;
        onMoveRef.current(fromBlock, toBlock, mediaId, evt.newIndex);
      },
    });
    return () => s.destroy();
  }, []);
  return (
    <div ref={gridRef} data-block={blockIndex} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 60 }}>
      {mediaIds.map(id => {
        const media = entry.media.find(m => m.id === id);
        if (!media) return null;
        return (
          <div key={id} data-id={id} style={{ position: 'relative', cursor: 'grab' }}>
            <img src={media.url} alt="" draggable={false}
              style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(id); }}
              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', fontSize: 10 }}>
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
