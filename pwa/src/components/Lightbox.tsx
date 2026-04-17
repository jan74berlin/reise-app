import { useEffect } from 'react';

interface Props {
  src: string;
  onClose: () => void;
}

export default function Lightbox({ src, onClose }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <img
        src={src} alt=""
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 6 }}
      />
      <button
        onClick={onClose}
        style={{
          position: 'fixed', top: 16, right: 16, background: 'rgba(255,255,255,0.15)',
          color: '#fff', border: 'none', borderRadius: '50%', width: 40, height: 40,
          fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
    </div>
  );
}
