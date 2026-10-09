import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isMissingTable } from '../lib/dbCompat'
import { calcStreak, toLocalISO, todayISO } from '../lib/utils'
import {
  WELCOME_AWARD, dayAwards, levelInfo, streakAward, STREAK_REWARDS, type Award, type Equipped, type LevelInfo, type ShopItem,
} from '../lib/game'
import { DEFAULT_AVATAR, type AvatarConfig } from '../components/character/avatarConfig'
import { useAuth } from './useAuth'
import { useTodayStatus } from './useTodayStatus'

// Charakter, Level, Punkte und Erfolge. Alles Verdiente steht in der Tabelle xp_events (jede Quelle + Referenz nur einmal),
// Level und Punkte sind Summen daraus. Das Spiel läuft nur für Athleten und schaltet sich ab, solange die Datenbank-Tabellen fehlen.

export interface Kennenlernen {
  anrede: string
  ziele: string[]
  warum: string
  erfahrung: string
  zeit: string
  schwierigkeiten: string[]
}

export interface Character {
  name: string
  config: AvatarConfig
  equipped: Equipped
  kennenlernen?: Kennenlernen | null
}

export interface GameToast { id: number; xp: number; punkte: number; titel: string[] }

interface Ctx {
  /** Läuft das Spiel (Athlet, Tabellen vorhanden)? */
  available: boolean
  loaded: boolean
  character: Character | null
  stats: { xp: number; punkte: number }
  level: LevelInfo
  owned: Set<string>
  toasts: GameToast[]
  levelUp: number | null
  dismissLevelUp: () => void
  /** Hat der Nutzer das einmalige Angebot (bestehende Konten) weggeklickt? */
  offerDismissed: boolean
  dismissOffer: () => void
  createCharacter: (c: Character) => Promise<boolean>
  updateCharacter: (patch: Partial<Character>) => Promise<boolean>
  /** Erfolge eintragen; liefert die wirklich neuen */
  award: (list: Award[], opts?: { silent?: boolean }) => Promise<Award[]>
  /** Punkte ausgeben (Shop, Belohnungen). Liefert einen Fehlertext oder null bei Erfolg. */
  spend: (quelle: string, ref: string, punkte: number, titel: string) => Promise<string | null>
  buy: (item: ShopItem) => Promise<string | null>
  equip: (eq: Equipped) => Promise<void>
}

const noop = async () => false
const GameContext = createContext<Ctx>({
  available: false, loaded: false, character: null, stats: { xp: 0, punkte: 0 }, level: levelInfo(0), owned: new Set(),
  toasts: [], levelUp: null, dismissLevelUp: () => {}, offerDismissed: true, dismissOffer: () => {},
  createCharacter: noop, updateCharacter: noop, award: async () => [], spend: async () => 'Nicht verfügbar', buy: async () => 'Nicht verfügbar', equip: async () => {},
})

const key = (a: { quelle: string; ref: string }) => `${a.quelle}|${a.ref}`
const offerKey = (uid: string) => `hlx-char-offer-${uid}`
const streakKey = (uid: string) => `hlx-streak-checked-${uid}`

function parseCharacter(row: Record<string, unknown> | null): Character | null {
  if (!row) return null
  return {
    name: String(row.name ?? ''),
    config: { ...DEFAULT_AVATAR, ...((row.config as Partial<AvatarConfig>) ?? {}) },
    equipped: (row.equipped as Equipped) ?? {},
    kennenlernen: (row.kennenlernen as Kennenlernen | null) ?? null,
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth()
  const { days, loaded: statusLoaded } = useTodayStatus()
  const isClient = !!user && profile?.role === 'client'

  const [available, setAvailable] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [character, setCharacter] = useState<Character | null>(null)
  const [stats, setStats] = useState({ xp: 0, punkte: 0 })
  const [owned, setOwned] = useState<Set<string>>(new Set())
  const [toasts, setToasts] = useState<GameToast[]>([])
  const [levelUp, setLevelUp] = useState<number | null>(null)
  const [offerDismissed, setOfferDismissed] = useState(true)
  const [waterGoal, setWaterGoal] = useState(0)

  const known = useRef<Set<string>>(new Set())
  // Stand von XP und Punkte: die Referenz ist die Wahrheit, damit zwei gleichzeitig eintreffende Erfolge nicht gegeneinander überschreiben
  const statsRef = useRef(stats)
  const applyStats = useCallback((fn: (s: { xp: number; punkte: number }) => { xp: number; punkte: number }) => {
    statsRef.current = fn(statsRef.current)
    setStats(statsRef.current)
    return statsRef.current
  }, [])
  const toastId = useRef(0)

  // ─── Laden ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isClient || !user) { setAvailable(false); setLoaded(false); setCharacter(null); return }
    let cancelled = false
    ;(async () => {
      const since = new Date(Date.now() - 4 * 86400000).toISOString()
      const [c, st, shop, recent, settings] = await Promise.all([
        supabase.from('characters').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('character_stats').select('xp,punkte').eq('user_id', user.id).maybeSingle(),
        supabase.from('xp_events').select('ref').eq('user_id', user.id).eq('quelle', 'shop'),
        supabase.from('xp_events').select('quelle,ref').eq('user_id', user.id).gte('created_at', since),
        supabase.from('client_settings').select('wasser_ziel_ml').eq('user_id', user.id).maybeSingle(),
      ])
      if (cancelled) return
      if (c.error && isMissingTable(c.error)) { setAvailable(false); setLoaded(true); return }
      setAvailable(true)
      setCharacter(parseCharacter(c.data as Record<string, unknown> | null))
      const s = (st.data as { xp?: number; punkte?: number } | null) ?? {}
      applyStats(() => ({ xp: s.xp ?? 0, punkte: s.punkte ?? 0 }))
      setOwned(new Set(((shop.data ?? []) as { ref: string }[]).map(r => r.ref)))
      known.current = new Set(((recent.data ?? []) as { quelle: string; ref: string }[]).map(key))
      setWaterGoal((settings.data as { wasser_ziel_ml?: number | null } | null)?.wasser_ziel_ml ?? 0)
      try { setOfferDismissed(localStorage.getItem(offerKey(user.id)) === '1') } catch { setOfferDismissed(false) }
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [isClient, user, applyStats])

  // ─── Erfolge eintragen ─────────────────────────────────────────────────────
  const award = useCallback(async (list: Award[], opts?: { silent?: boolean }): Promise<Award[]> => {
    if (!user || !list.length) return []
    list.forEach(a => known.current.add(key(a)))
    const { data, error } = await supabase
      .from('xp_events')
      .upsert(list.map(a => ({ user_id: user.id, ...a })) as never, { onConflict: 'user_id,quelle,ref', ignoreDuplicates: true })
      .select('quelle,ref,xp,punkte,titel')
    if (error) { list.forEach(a => known.current.delete(key(a))); return [] } // beim nächsten Mal noch einmal versuchen
    const added = ((data ?? []) as Award[])
    if (!added.length) return []
    const xp = added.reduce((a, r) => a + r.xp, 0)
    const punkte = added.reduce((a, r) => a + r.punkte, 0)
    const before = statsRef.current
    const next = applyStats(s => ({ xp: s.xp + xp, punkte: s.punkte + punkte }))
    if (!opts?.silent) {
      const id = ++toastId.current
      setToasts(t => [...t.slice(-2), { id, xp, punkte, titel: added.map(a => a.titel) }])
      window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200)
      const was = levelInfo(before.xp).level, now = levelInfo(next.xp).level
      if (now > was) setLevelUp(now)
    }
    return added
  }, [user, applyStats])

  // Tageserfolge: bei jeder Änderung heute und gestern prüfen (jeder Erfolg zählt nur einmal)
  useEffect(() => {
    if (!available || !character || !statusLoaded) return
    const today = todayISO()
    const fresh = Object.values(days)
      .flatMap(d => dayAwards({ ...d, waterGoalMl: waterGoal }).map(a => (d.date === today ? a : { ...a, titel: `${a.titel} (gestern)` })))
      .filter(a => !known.current.has(key(a)))
    if (fresh.length) void award(fresh)
  }, [available, character, statusLoaded, days, waterGoal, award])

  // Serien-Meilensteine: einmal pro Tag nach dem ersten Eintrag
  useEffect(() => {
    if (!available || !character || !user || !statusLoaded) return
    const today = todayISO()
    const d = days[today]
    if (!d || !(d.weight || d.sleep || d.mealsMain.length || d.trainingIds.length)) return
    let checked: string | null = null
    try { checked = localStorage.getItem(streakKey(user.id)) } catch { /* ignorieren */ }
    if (checked === today) return
    ;(async () => {
      const dates = new Set<string>()
      for (const table of ['gewicht', 'schlaf', 'training', 'food_log']) {
        const { data } = await supabase.from(table).select('datum').eq('user_id', user.id).order('datum', { ascending: false }).limit(1000)
        for (const r of (data ?? []) as { datum: string }[]) dates.add(r.datum)
      }
      const streak = calcStreak(dates)
      try { localStorage.setItem(streakKey(user.id), today) } catch { /* ignorieren */ }
      if (STREAK_REWARDS[streak] && dates.has(today)) {
        const start = new Date(); start.setDate(start.getDate() - (streak - 1))
        const a = streakAward(streak, toLocalISO(start))
        if (a) await award([a])
      }
    })()
  }, [available, character, user, statusLoaded, days, award])

  // ─── Charakter anlegen und ändern ──────────────────────────────────────────
  const createCharacter = useCallback(async (c: Character) => {
    if (!user) return false
    const { error } = await supabase.from('characters').upsert({
      user_id: user.id, name: c.name, config: c.config, equipped: c.equipped, kennenlernen: c.kennenlernen ?? null, updated_at: new Date().toISOString(),
    } as never, { onConflict: 'user_id' })
    if (error) return false
    setCharacter(c)
    await award([WELCOME_AWARD], { silent: true })
    return true
  }, [user, award])

  const updateCharacter = useCallback(async (patch: Partial<Character>) => {
    if (!user || !character) return false
    const next = { ...character, ...patch }
    setCharacter(next)
    const { error } = await supabase.from('characters').update({
      name: next.name, config: next.config, equipped: next.equipped, kennenlernen: next.kennenlernen ?? null, updated_at: new Date().toISOString(),
    } as never).eq('user_id', user.id)
    return !error
  }, [user, character])

  // ─── Punkte ausgeben ───────────────────────────────────────────────────────
  const spend = useCallback(async (quelle: string, ref: string, punkte: number, titel: string): Promise<string | null> => {
    if (!user) return 'Nicht angemeldet'
    if (statsRef.current.punkte < punkte) return 'Dafür reichen deine Punkte noch nicht.'
    const { error } = await supabase.from('xp_events').insert({ user_id: user.id, quelle, ref, xp: 0, punkte: -punkte, titel } as never)
    if (error) return /Nicht genug/i.test(error.message) ? 'Dafür reichen deine Punkte noch nicht.' : 'Das hat nicht geklappt. Versuche es noch einmal.'
    applyStats(s => ({ ...s, punkte: s.punkte - punkte }))
    return null
  }, [user, applyStats])

  const buy = useCallback(async (item: ShopItem): Promise<string | null> => {
    if (owned.has(item.id)) return 'Das hast du schon.'
    if (levelInfo(statsRef.current.xp).level < item.minLevel) return `Ab Level ${item.minLevel}.`
    const err = await spend('shop', item.id, item.preis, `${item.name} gekauft`)
    if (err) return err
    setOwned(prev => new Set(prev).add(item.id))
    return null
  }, [owned, spend])

  const equip = useCallback(async (eq: Equipped) => { await updateCharacter({ equipped: eq }) }, [updateCharacter])

  const dismissOffer = useCallback(() => {
    setOfferDismissed(true)
    if (user) try { localStorage.setItem(offerKey(user.id), '1') } catch { /* ignorieren */ }
  }, [user])

  const value = useMemo<Ctx>(() => ({
    available, loaded, character, stats, level: levelInfo(stats.xp), owned, toasts, levelUp,
    dismissLevelUp: () => setLevelUp(null), offerDismissed, dismissOffer,
    createCharacter, updateCharacter, award, spend, buy, equip,
  }), [available, loaded, character, stats, owned, toasts, levelUp, offerDismissed, dismissOffer, createCharacter, updateCharacter, award, spend, buy, equip])

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  return useContext(GameContext)
}
