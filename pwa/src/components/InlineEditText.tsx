import { useState } from 'react';

interface Props {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  inputType?: 'text' | 'date';
}

export default function InlineEditText({ value, placeholder, onSave, multiline, inputType = 'text' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const isEmpty = !value;
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, color: isEmpty ? '#aaa' : '#333', whiteSpace: 'pre-wrap' }}>
          {isEmpty ? (placeholder ?? '') : value}
        </div>
        <button
          onClick={startEdit}
          aria-label="Bearbeiten"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}
        >
          ✏️
        </button>
      </div>
    );
  }

  const commonStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={3}
          style={commonStyle}
        />
      ) : (
        <input
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          style={commonStyle}
        />
      )}
      {error && <div style={{ color: '#c33', fontSize: 12, marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#4a90e2', color: '#fff', border: 'none', cursor: saving ? 'wait' : 'pointer' }}
        >
          {saving ? 'Speichere…' : 'Speichern'}
        </button>
        <button
          onClick={() => { setEditing(false); setError(null); }}
          disabled={saving}
          style={{ padding: '6px 12px', borderRadius: 6, background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
