import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'theme'

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

// Farben für Recharts/SVG – dort greifen Tailwind-Klassen nicht.
// Werte entsprechen den Tokens in index.css (AA-geprüft).
export interface ChartColors {
  grid: string
  tick: string
  brand: string
  warning: string
  info: string
  accent: string
  success: string
  danger: string
  track: string
  text: string
}

const CHART_COLORS: Record<Theme, ChartColors> = {
  dark: {
    grid: '#272d2b', tick: '#8e9a95', brand: '#3bd4a6', warning: '#fbbf24', info: '#74b2fb',
    accent: '#b8a2fc', success: '#4ade80', danger: '#fa8585', track: '#2a312f', text: '#f3f5f4',
  },
  light: {
    grid: '#e8e2d9', tick: '#6b665f', brand: '#075640', warning: '#7a4708', info: '#1550bd',
    accent: '#5b30c0', success: '#0a5f2d', danger: '#9f1d24', track: '#ece6dd', text: '#1c1917',
  },
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  colors: ChartColors
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    // Farben kurz überblenden statt springen (siehe html.theme-fade in index.css)
    const root = document.documentElement
    root.classList.add('theme-fade')
    window.setTimeout(() => root.classList.remove('theme-fade'), 450)
    setThemeState(t)
    try { localStorage.setItem(STORAGE_KEY, t) } catch { /* Speicher blockiert – Theme gilt nur für diese Sitzung */ }
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    colors: CHART_COLORS[theme],
  }), [theme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden')
  return ctx
}
