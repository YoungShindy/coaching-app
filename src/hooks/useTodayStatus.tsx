import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, DATA_CHANGED_EVENT } from '../lib/supabase'
import { todayISO } from '../lib/utils'
import { useAuth } from './useAuth'

// Was heute schon eingetragen ist: steuert die grünen Reiter, Haken und den Zähler am Mehr-Reiter.

export type Level = 'none' | 'partial' | 'done'
export interface StatusItem { level: Level; done: number; total: number }
export type StatusKey = 'weight' | 'sleep' | 'training' | 'nutrition' | 'supplements'
export type TodayStatus = Record<StatusKey, StatusItem>

/** Hauptmahlzeiten: jede eingetragene Mahlzeit ist eine Stufe, Snacks zählen nicht mit. */
export const MAIN_MEALS = ['Frühstück', 'Mittagessen', 'Abendessen'] as const

/** Seite → Status-Schlüssel */
export const ROUTE_STATUS: Record<string, StatusKey> = {
  '/weight': 'weight',
  '/sleep': 'sleep',
  '/training': 'training',
  '/nutrition': 'nutrition',
  '/supplements': 'supplements',
}

export function makeItem(done: number, total: number): StatusItem {
  const d = Math.max(0, Math.min(done, total))
  return { done: d, total, level: total <= 0 || d <= 0 ? 'none' : d >= total ? 'done' : 'partial' }
}

export const EMPTY_STATUS: TodayStatus = {
  weight: makeItem(0, 1),
  sleep: makeItem(0, 1),
  training: makeItem(0, 1),
  nutrition: makeItem(0, MAIN_MEALS.length),
  supplements: makeItem(0, 0),
}

/** Satz für Screenreader, z. B. „2 von 3 Mahlzeiten heute“. */
export function statusLabel(key: StatusKey, item: StatusItem): string {
  switch (key) {
    case 'weight': return item.level === 'done' ? 'heute gewogen' : 'heute noch nicht gewogen'
    case 'sleep': return item.level === 'done' ? 'Schlaf heute eingetragen' : 'Schlaf heute noch offen'
    case 'training': return item.level === 'done' ? 'heute trainiert' : 'heute noch kein Training'
    case 'nutrition': return `${item.done} von ${item.total} Mahlzeiten heute`
    case 'supplements': return item.total ? `${item.done} von ${item.total} heute genommen` : 'keine Supplements angelegt'
  }
}

interface Ctx { status: TodayStatus; loaded: boolean; refresh: () => void }
const TodayStatusContext = createContext<Ctx>({ status: EMPTY_STATUS, loaded: false, refresh: () => {} })

export function TodayStatusProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState<TodayStatus>(EMPTY_STATUS)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const isClient = !!user && profile?.role !== 'coach'

  const load = useCallback(async () => {
    if (!user || !isClient) return
    const day = todayISO()
    const today = (table: string, cols: string) =>
      supabase.from(table).select(cols).eq('user_id', user.id).eq('datum', day)
    try {
      const [w, s, t, f, sup, log] = await Promise.all([
        today('gewicht', 'id').limit(1),
        today('schlaf', 'id').limit(1),
        today('training', 'id').limit(1),
        today('food_log', 'mahlzeit'),
        supabase.from('supplements').select('id').eq('user_id', user.id).eq('aktiv', true),
        today('supplement_log', 'supplement_id,eingenommen'),
      ])
      const meals = new Set(((f.data ?? []) as unknown as { mahlzeit: string }[]).map(r => r.mahlzeit))
      const mainDone = MAIN_MEALS.filter(m => meals.has(m)).length
      const activeIds = new Set(((sup.data ?? []) as unknown as { id: string }[]).map(r => r.id))
      const taken = new Set(
        ((log.data ?? []) as unknown as { supplement_id: string; eingenommen: boolean }[])
          .filter(r => r.eingenommen && activeIds.has(r.supplement_id)).map(r => r.supplement_id),
      )
      setStatus({
        weight: makeItem(w.data?.length ?? 0, 1),
        sleep: makeItem(s.data?.length ?? 0, 1),
        training: makeItem(t.data?.length ?? 0, 1),
        nutrition: makeItem(mainDone, MAIN_MEALS.length),
        supplements: makeItem(taken.size, activeIds.size),
      })
      setLoaded(true)
    } catch { /* Offline oder Fehler: letzten Stand behalten */ }
  }, [user, isClient])

  // Mehrere Änderungen kurz hintereinander werden zu einer Abfrage zusammengefasst
  const refresh = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void load() }, 250)
  }, [load])

  useEffect(() => { void load() }, [load, location.pathname])
  useEffect(() => {
    window.addEventListener(DATA_CHANGED_EVENT, refresh)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearTimeout(timer.current)
    }
  }, [refresh])

  const value = useMemo(() => ({ status: isClient ? status : EMPTY_STATUS, loaded: isClient && loaded, refresh }), [status, loaded, refresh, isClient])
  return <TodayStatusContext.Provider value={value}>{children}</TodayStatusContext.Provider>
}

export function useTodayStatus() {
  return useContext(TodayStatusContext)
}
