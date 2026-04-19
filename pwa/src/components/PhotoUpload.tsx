import { useRef, useState } from 'react';
import { resizeImage } from '../utils/resizeImage';
import { uploadMedia } from '../api/journal';

interface Props {
  tripId: string;
  entryId: string;
  onUploaded: (mediaId: string, url: string) => void;
}

type ProgressState = 'resizing' | 'uploading' | 'done' | 'error';

interface FileState {
  name: string;
  progress: ProgressState;
  preview: string;
}

export default function PhotoUpload({ tripId, entryId, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileState[]>([]);

  async function handleFiles(fileList: FileList) {
    const arr = Array.from(fileList);
    const initial: FileState[] = arr.map(f => ({
      name: f.name,
      progress: 'resizing',
      preview: URL.createObjectURL(f),
    }));
    setFiles(initial);

    for (let i = 0; i < arr.length; i++) {
      try {
        setFiles(s => s.map((x, j) => j === i ? { ...x, progress: 'resizing' } : x));
        const resized = await resizeImage(arr[i]);
        setFiles(s => s.map((x, j) => j === i ? { ...x, progress: 'uploading' } : x));
        const { media } = await uploadMedia(tripId, entryId, resized);
        onUploaded(media.id, media.url);
        setFiles(s => s.map((x, j) => j === i ? { ...x, progress: 'done' } : x));
      } catch {
        setFiles(s => s.map((x, j) => j === i ? { ...x, progress: 'error' } : x));
      }
    }
    setFiles(s => s.filter(x => x.progress !== 'done'));
  }

  const icon: Record<ProgressState, string> = {
    resizing: '⏳', uploading: '⬆', done: '✓', error: '✕',
  };

  return (
    <div>
      <input
        ref={inputRef} type="file" multiple accept="image/*"
        style={{ display: 'none' }}
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #4a90e2', borderRadius: 12, padding: '28px 20px',
          textAlign: 'center', background: '#f0f6ff', cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 36 }}>📷</div>
        <div style={{ fontWeight: 600, marginTop: 8 }}>Fotos auswählen</div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
          Galerie öffnen · mehrere wählbar · werden auf 1280px verkleinert
        </div>
      </div>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {files.map((f, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={f.preview} alt="" style={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                borderRadius: 4, padding: '1px 4px', fontSize: 11,
              }}>
                {icon[f.progress]}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
