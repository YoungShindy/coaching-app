import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase, DATA_CHANGED_EVENT } from '../lib/supabase'
import { todayISO, toLocalISO } from '../lib/utils'
import type { DayAwardFacts } from '../lib/game'
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

/** Rohdaten pro Tag (heute und gestern); daraus berechnet das Spiel Erfolge und XP. Das Wasserziel ergänzt das Spiel selbst. */
export type DayFactsMap = Record<string, Omit<DayAwardFacts, 'waterGoalMl'>>

interface Ctx { status: TodayStatus; loaded: boolean; refresh: () => void; days: DayFactsMap }
const TodayStatusContext = createContext<Ctx>({ status: EMPTY_STATUS, loaded: false, refresh: () => {}, days: {} })

export function TodayStatusProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const location = useLocation()
  const [status, setStatus] = useState<TodayStatus>(EMPTY_STATUS)
  const [loaded, setLoaded] = useState(false)
  const [days, setDays] = useState<DayFactsMap>({})
  const timer = useRef<number | undefined>(undefined)
  const isClient = !!user && profile?.role !== 'coach'

  const load = useCallback(async () => {
    if (!user || !isClient) return
    const day = todayISO()
    const yd = new Date(); yd.setDate(yd.getDate() - 1)
    const yesterday = toLocalISO(yd)
    const both = [day, yesterday]
    const since = (table: string, cols: string) =>
      supabase.from(table).select(cols).eq('user_id', user.id).in('datum', both)
    try {
      const [w, s, t, f, sup, log, wat] = await Promise.all([
        since('gewicht', 'datum'),
        since('schlaf', 'datum'),
        since('training', 'id,datum'),
        since('food_log', 'mahlzeit,datum'),
        supabase.from('supplements').select('id').eq('user_id', user.id).eq('aktiv', true),
        since('supplement_log', 'supplement_id,eingenommen,datum'),
        since('wasser_log', 'menge_ml,datum'),
      ])
      const rows = <T,>(r: { data: unknown }) => (r.data ?? []) as unknown as (T & { datum: string })[]
      const activeIds = new Set(((sup.data ?? []) as unknown as { id: string }[]).map(r => r.id))

      const perDay: DayFactsMap = {}
      for (const date of both) {
        const meals = new Set(rows<{ mahlzeit: string }>(f).filter(r => r.datum === date).map(r => r.mahlzeit))
        const taken = new Set(
          rows<{ supplement_id: string; eingenommen: boolean }>(log)
            .filter(r => r.datum === date && r.eingenommen && activeIds.has(r.supplement_id)).map(r => r.supplement_id),
        )
        perDay[date] = {
          date,
          mealsMain: MAIN_MEALS.filter(m => meals.has(m)),
          sleep: rows(s).some(r => r.datum === date),
          weight: rows(w).some(r => r.datum === date),
          trainingIds: rows<{ id: string }>(t).filter(r => r.datum === date).map(r => r.id),
          supplementsTotal: activeIds.size,
          supplementsTaken: taken.size,
          waterMl: rows<{ menge_ml: number }>(wat).filter(r => r.datum === date).reduce((a, r) => a + (r.menge_ml ?? 0), 0),
        }
      }
      const d = perDay[day]
      setStatus({
        weight: makeItem(d.weight ? 1 : 0, 1),
        sleep: makeItem(d.sleep ? 1 : 0, 1),
        training: makeItem(d.trainingIds.length > 0 ? 1 : 0, 1),
        nutrition: makeItem(d.mealsMain.length, MAIN_MEALS.length),
        supplements: makeItem(d.supplementsTaken, d.supplementsTotal),
      })
      setDays(perDay)
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

  const value = useMemo(() => ({ status: isClient ? status : EMPTY_STATUS, loaded: isClient && loaded, refresh, days }), [status, loaded, refresh, isClient, days])
  return <TodayStatusContext.Provider value={value}>{children}</TodayStatusContext.Provider>
}

export function useTodayStatus() {
  return useContext(TodayStatusContext)
}
