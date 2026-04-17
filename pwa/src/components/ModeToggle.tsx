import { useMode } from '../contexts/ModeContext';

export default function ModeToggle() {
  const { mode, setMode } = useMode();

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button
        onClick={() => setMode('mobile')}
        title="Handy-Modus"
        style={{
          padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: mode === 'mobile' ? '#4a90e2' : '#eee',
          color: mode === 'mobile' ? '#fff' : '#666',
          fontSize: 16,
        }}>📱</button>
      <button
        onClick={() => setMode('desktop')}
        title="Desktop-Modus"
        style={{
          padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: mode === 'desktop' ? '#4a90e2' : '#eee',
          color: mode === 'desktop' ? '#fff' : '#666',
          fontSize: 16,
        }}>🖥</button>
    </div>
  );
}
