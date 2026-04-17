import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      setAuth(token, user);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 16px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: 32 }}>🧭 Reisetagebuch</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="E-Mail" required
          style={{ padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Passwort" required
          style={{ padding: '10px 12px', fontSize: 16, borderRadius: 8, border: '1px solid #ccc' }}
        />
        {error && <p style={{ color: '#c00', margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading}
          style={{ padding: '12px', fontSize: 16, borderRadius: 8, background: '#4a90e2', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {loading ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>
    </div>
  );
}
