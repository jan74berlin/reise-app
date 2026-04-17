import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '../types';
import { getMe } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthState>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getMe()
      .then(({ user }) => setUser(user))
      .catch(() => { localStorage.removeItem('jwt'); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  function setAuth(t: string, u: User) {
    localStorage.setItem('jwt', t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem('jwt');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, setAuth, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
