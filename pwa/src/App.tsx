import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ModeProvider } from './contexts/ModeContext';
import LoginPage from './pages/LoginPage';
import TripsPage from './pages/TripsPage';
import TripPage from './pages/TripPage';
import JournalEntryPage from './pages/JournalEntryPage';
import JournalEntryViewPage from './pages/JournalEntryViewPage';

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 32 }}>Lade…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <ModeProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Guard><TripsPage /></Guard>} />
            <Route path="/trips/:tripId" element={<Guard><TripPage /></Guard>} />
            <Route path="/trips/:tripId/journal/:entryId" element={<Guard><JournalEntryPage /></Guard>} />
            <Route path="/trips/:tripId/journal/:entryId/view" element={<Guard><JournalEntryViewPage /></Guard>} />
          </Routes>
        </BrowserRouter>
      </ModeProvider>
    </AuthProvider>
  );
}
