// Übungspool: deutsche Daten (public/exercises/data/exercises_de.json) und Muskelgruppen

export type GroupKey =
  | 'brust' | 'ruecken' | 'schultern' | 'bizeps' | 'trizeps' | 'unterarme' | 'quadrizeps' | 'beinbeuger'
  | 'gesaess' | 'waden' | 'bauch' | 'unterer_ruecken' | 'trapez' | 'huefte' | 'cardio' | 'sonstige'

export interface PoolExercise {
  id: string
  name: string
  name_en: string
  body_part: string
  body_part_de: string
  equipment: string
  equipment_de: string
  equipment_group: string
  target: string
  target_de: string
  secondary_de: string[]
  steps: string[]
  group: GroupKey
  compound: 0 | 1
  stretch: 0 | 1
  image: string
  gif: string
}

export const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'brust', label: 'Brust' },
  { key: 'ruecken', label: 'Rücken' },
  { key: 'schultern', label: 'Schultern' },
  { key: 'bizeps', label: 'Bizeps' },
  { key: 'trizeps', label: 'Trizeps' },
  { key: 'unterarme', label: 'Unterarme' },
  { key: 'quadrizeps', label: 'Quadrizeps' },
  { key: 'beinbeuger', label: 'Beinbeuger' },
  { key: 'gesaess', label: 'Gesäß' },
  { key: 'waden', label: 'Waden' },
  { key: 'bauch', label: 'Bauch' },
  { key: 'unterer_ruecken', label: 'Unterer Rücken' },
  { key: 'trapez', label: 'Trapez' },
  { key: 'huefte', label: 'Hüfte' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'sonstige', label: 'Sonstige' },
]

export const groupLabel = (key: string) => GROUPS.find(g => g.key === key)?.label ?? 'Sonstige'

export const BASE = import.meta.env.BASE_URL + 'exercises/'
export const imgUrl = (ex: Pick<PoolExercise, 'image'>) => BASE + ex.image
export const gifUrl = (ex: Pick<PoolExercise, 'gif'>) => BASE + ex.gif

let cache: Promise<PoolExercise[]> | null = null

/** Lädt den kompletten deutschen Übungspool einmal und merkt ihn sich. */
export function loadExercises(): Promise<PoolExercise[]> {
  if (!cache) {
    cache = fetch(BASE + 'data/exercises_de.json')
      .then(r => { if (!r.ok) throw new Error('Übungsdaten nicht gefunden'); return r.json() as Promise<PoolExercise[]> })
      .catch(err => { cache = null; throw err })
  }
  return cache
}

/** Kleinbuchstaben ohne Umlaute und Sonderzeichen, damit „bankdrucken“ auch „Bankdrücken“ findet. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function searchKey(ex: PoolExercise): string {
  return norm(`${ex.name} ${ex.name_en} ${ex.equipment_de} ${ex.target_de} ${ex.body_part_de}`)
}

/** Findet die Pool-Übung zu einem eingetragenen Namen (deutsch oder englisch). */
export function findByName(name: string, pool: PoolExercise[]): PoolExercise | undefined {
  const n = norm(name)
  if (!n) return undefined
  return pool.find(e => norm(e.name) === n) ?? pool.find(e => norm(e.name_en) === n)
}

const EQ_RANK: Record<string, number> = { Langhantel: 0, Kurzhantel: 1, Maschine: 2, Kabel: 3, 'Körpergewicht': 4 }

/** Gängige Geräte zuerst: Langhantel, Kurzhantel, Maschine, Kabel, Körpergewicht, dann der Rest. */
export const equipmentRank = (e: Pick<PoolExercise, 'equipment_group'>) => EQ_RANK[e.equipment_group] ?? 5

/** Wie findByName, findet aber auch ungefähre Namen („Bankdrücken“ → Langhantel-Bankdrücken, „Kniebeugen“ → Kniebeuge). */
export function findBest(name: string, pool: PoolExercise[]): PoolExercise | undefined {
  const exact = findByName(name, pool)
  if (exact) return exact
  const words = norm(name).split(' ').filter(Boolean)
  if (!words.length) return undefined
  const hits = pool.filter(e => {
    const k = norm(`${e.name} ${e.name_en}`)
    return words.every(w => k.includes(w) || (w.length > 4 && k.includes(w.slice(0, -1))))
  })
  hits.sort((a, b) =>
    (b.compound - a.compound) || (equipmentRank(a) - equipmentRank(b)) || a.name.length - b.name.length)
  return hits[0]
}

// Muskelgruppe aus dem Namen raten, wenn die Übung nicht im Pool steht (eigene Namen)
const GUESS: [RegExp, GroupKey][] = [
  [/kniebeuge|squat|beinpresse|leg press|ausfallschritt|lunge|beinstrecker|leg extension|step.?up/, 'quadrizeps'],
  [/beinbeuger|leg curl|rumanian|rumaenisch|romanian|stiff.?leg/, 'beinbeuger'],
  [/hip thrust|glute|gesaess|po |kickback.*bein/, 'gesaess'],
  [/wade|calf/, 'waden'],
  [/bank|brust|fliegende|butterfly|chest|bench|liegestuetz|push.?up|dip/, 'brust'],
  [/kreuzheben|deadlift|rueckenstrecker|hyperextension|good morning/, 'unterer_ruecken'],
  [/klimmzug|pull.?up|chin.?up|latzug|lat |pulldown|rudern|row|pullover|rueck/, 'ruecken'],
  [/schulter|seitheben|frontheben|shoulder|lateral raise|overhead|military|face pull|arnold|schulterdruecken/, 'schultern'],
  [/trapez|shrug|schulterzucken/, 'trapez'],
  [/bizeps|curl|hammer/, 'bizeps'],
  [/trizeps|triceps|skull|pushdown|kickback|french/, 'trizeps'],
  [/unterarm|handgelenk|wrist|forearm/, 'unterarme'],
  [/bauch|crunch|sit.?up|plank|abs|beinheben|russian|twist/, 'bauch'],
  [/laufen|rad|cardio|rudergeraet|crosstrainer|seilspringen|hiit|burpee/, 'cardio'],
]

export function guessGroup(name: string, pool?: PoolExercise[]): GroupKey {
  if (pool) {
    const hit = findByName(name, pool)
    if (hit) return hit.group
  }
  const n = norm(name)
  for (const [re, g] of GUESS) if (re.test(n)) return g
  return 'sonstige'
}
