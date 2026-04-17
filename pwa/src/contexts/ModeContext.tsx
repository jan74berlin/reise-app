import { createContext, useContext, useState, ReactNode } from 'react';

type Mode = 'mobile' | 'desktop';

interface ModeState {
  mode: Mode;
  setMode: (m: Mode) => void;
}

const ModeContext = createContext<ModeState>(null!);

function detectMode(): Mode {
  const saved = localStorage.getItem('pwa_mode') as Mode | null;
  if (saved) return saved;
  return window.innerWidth < 768 ? 'mobile' : 'desktop';
}

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(detectMode);

  function setMode(m: Mode) {
    localStorage.setItem('pwa_mode', m);
    setModeState(m);
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export const useMode = () => useContext(ModeContext);
