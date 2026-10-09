// Kraft-Fortschritt: Sätze mit unterschiedlichem Gewicht und Wiederholungen werden vergleichbar gemacht.
import { guessGroup, norm, type GroupKey, type PoolExercise } from './exercises'

export interface SetLog { wdh: number | null; kg: number | null }

/** Ein Training einer Übung: Datum und alle Sätze. */
export interface ExerciseSession {
  name: string
  datum: string // YYYY-MM-DD
  sets: SetLog[]
}

export type Metric = 'max' | 'volumen'

export interface SeriesPoint {
  datum: string
  value: number // je nach Metrik: geschätztes Maximalgewicht (kg), Volumen (kg) oder Wiederholungen
  bw: number | null // Körpergewicht an diesem Tag
}

export interface ExerciseSeries {
  key: string // normalisierter Name
  name: string
  group: GroupKey
  unit: 'kg' | 'wdh' // wdh: Übung ohne Gewicht, es zählen die Wiederholungen
  points: SeriesPoint[]
}

/** Epley-Formel: geschätztes Gewicht für genau eine Wiederholung. */
export function e1rm(kg: number, wdh: number): number {
  if (wdh <= 1) return kg
  return kg * (1 + wdh / 30)
}

function validSets(sets: SetLog[]): { kg: number; wdh: number }[] {
  return sets
    .filter(s => s.wdh && s.wdh > 0 && s.kg && s.kg > 0)
    .map(s => ({ kg: s.kg as number, wdh: s.wdh as number }))
}

export function bestE1rm(sets: SetLog[]): number | null {
  const v = validSets(sets)
  if (!v.length) return null
  return Math.max(...v.map(s => e1rm(s.kg, s.wdh)))
}

export function totalVolume(sets: SetLog[]): number | null {
  const v = validSets(sets)
  if (!v.length) return null
  return v.reduce((a, s) => a + s.kg * s.wdh, 0)
}

export function bestReps(sets: SetLog[]): number | null {
  const reps = sets.map(s => s.wdh ?? 0).filter(n => n > 0)
  return reps.length ? Math.max(...reps) : null
}

/** Körpergewicht an einem Tag: letzter Eintrag am oder vor dem Datum, sonst der erste danach. */
export function bodyweightOn(datum: string, weights: { datum: string; gewicht: number }[]): number | null {
  if (!weights.length) return null
  const sorted = [...weights].sort((a, b) => a.datum.localeCompare(b.datum))
  let hit: number | null = null
  for (const w of sorted) { if (w.datum <= datum) hit = w.gewicht; else break }
  return hit ?? sorted[0].gewicht
}

/**
 * Baut je Übung eine Reihe aus Datum und Wert.
 * Mehrere Einträge am selben Tag werden zusammengefasst (bester Wert, Volumen summiert).
 */
export function buildSeries(
  sessions: ExerciseSession[],
  weights: { datum: string; gewicht: number }[],
  metric: Metric,
  pool: PoolExercise[],
): ExerciseSeries[] {
  const byKey = new Map<string, ExerciseSession[]>()
  for (const s of sessions) {
    const key = norm(s.name)
    if (!key) continue
    ;(byKey.get(key) ?? byKey.set(key, []).get(key)!).push(s)
  }
  const out: ExerciseSeries[] = []
  for (const [key, list] of byKey) {
    const name = list[list.length - 1].name
    const hasWeight = list.some(s => validSets(s.sets).length > 0)
    const byDay = new Map<string, ExerciseSession[]>()
    for (const s of list) (byDay.get(s.datum) ?? byDay.set(s.datum, []).get(s.datum)!).push(s)
    const points: SeriesPoint[] = []
    for (const [datum, day] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
      const sets = day.flatMap(d => d.sets)
      let value: number | null
      if (!hasWeight) value = bestReps(sets)
      else value = metric === 'volumen' ? totalVolume(sets) : bestE1rm(sets)
      if (value === null) continue
      points.push({ datum, value, bw: bodyweightOn(datum, weights) })
    }
    if (!points.length) continue
    out.push({ key, name, group: guessGroup(name, pool), unit: hasWeight ? 'kg' : 'wdh', points })
  }
  return out.sort((a, b) => b.points.length - a.points.length)
}

export interface Change {
  series: ExerciseSeries
  start: number
  end: number
  delta: number
  pct: number
  from: string
  to: string
}

/** Vergleich innerhalb eines Zeitraums. Nur Übungen mit mindestens zwei Einträgen. */
export function compare(series: ExerciseSeries, sinceISO: string | null, relativeToBodyweight: boolean): Change | null {
  const pts = series.points.filter(p => !sinceISO || p.datum >= sinceISO)
  if (pts.length < 2) return null
  const val = (p: SeriesPoint) => {
    if (!relativeToBodyweight || series.unit !== 'kg') return p.value
    return p.bw ? p.value / p.bw : NaN
  }
  const a = pts[0]
  const b = pts[pts.length - 1]
  const start = val(a)
  const end = val(b)
  if (!isFinite(start) || !isFinite(end) || start <= 0) return null
  return { series, start, end, delta: end - start, pct: ((end - start) / start) * 100, from: a.datum, to: b.datum }
}

export interface GroupChange {
  group: GroupKey
  pct: number // Durchschnitt der Prozent-Änderungen
  items: Change[]
}

export function byGroup(changes: Change[]): GroupChange[] {
  const map = new Map<GroupKey, Change[]>()
  for (const c of changes) (map.get(c.series.group) ?? map.set(c.series.group, []).get(c.series.group)!).push(c)
  return [...map]
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => b.pct - a.pct),
      pct: items.reduce((s, c) => s + c.pct, 0) / items.length,
    }))
    .sort((a, b) => b.pct - a.pct)
}

export function overall(groups: GroupChange[]): number | null {
  if (!groups.length) return null
  return groups.reduce((s, g) => s + g.pct, 0) / groups.length
}

export const fmtPct = (p: number) => `${p > 0 ? '+' : ''}${p.toFixed(1).replace('.', ',')} %`
export const fmtKg = (v: number, digits = 1) => `${(Math.round(v * 10 ** digits) / 10 ** digits).toString().replace('.', ',')} kg`
