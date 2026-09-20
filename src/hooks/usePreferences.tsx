import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TimeFormat } from '../utils/format';

export type { TimeFormat };

const TIME_FORMAT_KEY = 'knowra_time_format';

function readTimeFormat(): TimeFormat {
  try {
    const raw = localStorage.getItem(TIME_FORMAT_KEY);
    if (raw === '12h' || raw === '24h') return raw;
  } catch {
    // ignore
  }
  return '12h';
}

type PreferencesContextValue = {
  timeFormat: TimeFormat;
  setTimeFormat: (format: TimeFormat) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(() => readTimeFormat());

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setTimeFormatState(format);
    try {
      localStorage.setItem(TIME_FORMAT_KEY, format);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({ timeFormat, setTimeFormat }),
    [timeFormat, setTimeFormat],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
