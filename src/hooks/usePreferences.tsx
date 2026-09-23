import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TimeFormat } from '../utils/format';

export type { TimeFormat };

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const TIME_FORMAT_KEY = 'knowra_time_format';
const THEME_KEY = 'knowra_theme';

function readTimeFormat(): TimeFormat {
  try {
    const raw = localStorage.getItem(TIME_FORMAT_KEY);
    if (raw === '12h' || raw === '24h') return raw;
  } catch {
    // ignore
  }
  return '12h';
}

function readTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme === 'system' ? systemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content',
    resolved === 'light' ? '#f3f0e8' : '#0a0a0a',
  );
}

type PreferencesContextValue = {
  timeFormat: TimeFormat;
  setTimeFormat: (format: TimeFormat) => void;
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [timeFormat, setTimeFormatState] = useState<TimeFormat>(() => readTimeFormat());
  const [theme, setThemeState] = useState<ThemePreference>(() => readTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(readTheme()));

  const setTimeFormat = useCallback((format: TimeFormat) => {
    setTimeFormatState(format);
    try {
      localStorage.setItem(TIME_FORMAT_KEY, format);
    } catch {
      // ignore
    }
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const value = useMemo(
    () => ({ timeFormat, setTimeFormat, theme, resolvedTheme, setTheme }),
    [timeFormat, setTimeFormat, theme, resolvedTheme, setTheme],
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
