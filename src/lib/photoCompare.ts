// Reine Rechenlogik für den Foto-Vergleich (ohne Datenbank, damit sie sich testen lässt).

export interface BodyPhoto {
  id: string
  datum: string // YYYY-MM-DD
  label: string
  path: string | null // Pfad im Bucket (null, wenn nur eine fremde Adresse bekannt ist)
  url: string | null // frisch signierte Adresse zum Anzeigen
  legacyWeightId?: string // Eintrag in gewicht, falls aus altem foto_url
  weightKg?: number | null
}

const DAY = 86400000
export const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY)
export const daysBetween = (a: string, b: string) => dayNumber(a) - dayNumber(b)

export function shiftISO(iso: string, days: number): string {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY)
  return d.toISOString().slice(0, 10)
}

export type CompareSpan = 30 | 60 | 90 | 'start' | 'custom'

export interface Comparison {
  now: BodyPhoto
  before: BodyPhoto | null
  /** Abstand zwischen den beiden Fotos in Tagen */
  gapDays: number
  /** Gewünschter Abstand (Tage), -1 bei „Start“ */
  wanted: number
  /** Nächstes Foto weicht mehr als eine Woche vom Wunsch ab */
  approximate: boolean
}

/**
 * „Heute“ ist das neueste Foto der Pose, „Vorher“ das Foto, das dem Wunsch am nächsten liegt
 * (z. B. 30 Tage davor). Gibt es keins genau dort, wird das nächstgelegene gezeigt.
 */
export function compare(photos: BodyPhoto[], label: string, span: CompareSpan, customDate?: string): Comparison | null {
  const mine = photos.filter(p => p.label === label)
  if (!mine.length) return null
  const now = mine[0] // neueste (Liste ist absteigend sortiert)
  const others = mine.filter(p => p.id !== now.id && p.datum < now.datum)
  if (!others.length) return { now, before: null, gapDays: 0, wanted: span === 'custom' || span === 'start' ? -1 : span, approximate: false }

  if (span === 'start') {
    const first = others[others.length - 1]
    return { now, before: first, gapDays: daysBetween(now.datum, first.datum), wanted: -1, approximate: false }
  }
  const target = span === 'custom' && customDate ? customDate : shiftISO(now.datum, -(span === 'custom' ? 30 : span))
  let best = others[0]
  for (const p of others) if (Math.abs(daysBetween(p.datum, target)) < Math.abs(daysBetween(best.datum, target))) best = p
  const wanted = span === 'custom' ? daysBetween(now.datum, target) : span
  return { now, before: best, gapDays: daysBetween(now.datum, best.datum), wanted, approximate: Math.abs(daysBetween(best.datum, target)) > 7 }
}
