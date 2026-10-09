import { supabase } from './supabase'
import { compressImage } from './koerperfotos'
import { weekKey } from './game'
import { toLocalISO } from './utils'

// Challenges aus der Datenbank: Zeilen, Nachweis-Fotos und die Fragen „Was zählt diese Woche / heute?“

export const PROOF_BUCKET = 'challenge-proofs'

export interface ChallengeRow {
  id: string
  user_id: string
  coach_id: string | null
  vorlage_id: string | null
  titel: string
  beschreibung: string | null
  kategorie: string | null
  punkte: number
  status: 'aktiv' | 'erledigt' | 'abgebrochen'
  frist: string | null
  nachweis_text: string | null
  nachweis_pfad: string | null
  erledigt_am: string | null
  created_at: string
}

export async function loadChallenges(userId: string): Promise<ChallengeRow[] | null> {
  const { data, error } = await supabase.from('challenges').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(300)
  if (error) return null
  return (data ?? []) as unknown as ChallengeRow[]
}

/** Vorlagen, die diese Woche schon erledigt wurden: sie kommen erst nächste Woche wieder. */
export function doneThisWeek(rows: ChallengeRow[], todayISO: string): Set<string> {
  const wk = weekKey(todayISO)
  const out = new Set<string>()
  for (const r of rows) {
    if (r.status !== 'erledigt' || !r.vorlage_id || !r.erledigt_am) continue
    if (weekKey(toLocalISO(new Date(r.erledigt_am))) === wk) out.add(r.vorlage_id)
  }
  return out
}

/** Wie viele Challenges hat der Nutzer heute selbst gestartet? (Coach-Challenges zählen nicht) */
export function startedToday(rows: ChallengeRow[], todayISO: string): number {
  return rows.filter(r => !r.coach_id && toLocalISO(new Date(r.created_at)) === todayISO).length
}

export async function uploadProof(userId: string, challengeId: string, file: File): Promise<string | null> {
  const blob = await compressImage(file, 1400, 0.82)
  const path = `${userId}/${challengeId}-${Date.now()}.jpg`
  const up = await supabase.storage.from(PROOF_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  return up.error ? null : path
}

export async function signProof(path: string): Promise<string | null> {
  try {
    const { data } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  } catch { return null }
}
