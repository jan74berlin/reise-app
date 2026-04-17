import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTrips, createTrip } from '../api/trips';
import { useAuth } from '../contexts/AuthContext';
import ModeToggle from '../components/ModeToggle';
import type { Trip } from '../types';

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    getTrips().then(({ trips }) => setTrips(trips)).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const { trip } = await createTrip({ title: newTitle.trim() });
    setTrips(t => [...t, trip]);
    setNewTitle('');
    setShowForm(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>🧭 Meine Reisen</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <ModeToggle />
          <button onClick={logout} style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Logout</button>
        </div>
      </div>

      {loading ? <p>Lade…</p> : trips.map(t => (
        <div key={t.id} onClick={() => navigate(`/trips/${t.id}`)}
          style={{ background: '#f5f7fa', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', borderLeft: '4px solid #4a90e2' }}>
          <div style={{ fontWeight: 600 }}>{t.title}</div>
          {t.start_date && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{t.start_date} – {t.end_date ?? '?'}</div>}
        </div>
      ))}

      {showForm ? (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Reisetitel" autoFocus
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }} />
          <button type="submit" style={{ padding: '8px 14px', borderRadius: 8, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer' }}>OK</button>
          <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>✕</button>
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
