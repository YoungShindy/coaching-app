// Spielregeln: Level, Punkte, Erfolge, Shop, Challenges und Belohnungen.
// Reine Logik ohne Datenbank, damit sie sich testen lässt (npm test).

// ─── Level ────────────────────────────────────────────────────────────────────

/** XP, die von Level L zu Level L+1 nötig sind: 100, 125, 150, ... */
export const xpToNext = (level: number) => 100 + 25 * (level - 1)
/** XP-Summe, ab der Level L erreicht ist (Level 1 = 0 XP) */
export const xpForLevel = (level: number) => 100 * (level - 1) + (25 * (level - 1) * (level - 2)) / 2

export interface LevelInfo { level: number; xpInto: number; xpNeed: number; pct: number; next: number }

export function levelInfo(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp))
  let level = 1
  while (xpForLevel(level + 1) <= safe) level++
  const xpInto = safe - xpForLevel(level)
  const xpNeed = xpToNext(level)
  return { level, xpInto, xpNeed, pct: Math.min(100, Math.round((xpInto / xpNeed) * 100)), next: level + 1 }
}

const TITLES: [number, string][] = [
  [1, 'Starter'], [3, 'Dranbleiber'], [5, 'Aktivposten'], [8, 'Power-Athlet'], [12, 'Routine-Profi'], [16, 'Champion'], [20, 'Legende'], [30, 'Ikone'],
]
export function levelTitle(level: number): string {
  let t = TITLES[0][1]
  for (const [l, name] of TITLES) if (level >= l) t = name
  return t
}

// ─── Erfolge des Tages ────────────────────────────────────────────────────────

export interface Award { quelle: string; ref: string; xp: number; punkte: number; titel: string }

export interface DayAwardFacts {
  date: string
  mealsMain: string[] // eingetragene Hauptmahlzeiten (Frühstück, Mittagessen, Abendessen)
  sleep: boolean
  weight: boolean
  trainingIds: string[]
  supplementsTotal: number
  supplementsTaken: number
  waterMl: number
  waterGoalMl: number
}

export const MAIN_MEAL_NAMES = ['Frühstück', 'Mittagessen', 'Abendessen']

export const STREAK_REWARDS: Record<number, { xp: number; punkte: number }> = {
  3: { xp: 15, punkte: 10 }, 7: { xp: 40, punkte: 25 }, 14: { xp: 80, punkte: 40 }, 21: { xp: 100, punkte: 50 },
  30: { xp: 150, punkte: 75 }, 50: { xp: 200, punkte: 100 }, 75: { xp: 250, punkte: 125 }, 100: { xp: 300, punkte: 200 },
  150: { xp: 350, punkte: 250 }, 200: { xp: 400, punkte: 300 }, 365: { xp: 500, punkte: 500 },
}

/** Ist der Tag „grün“? Alle drei Mahlzeiten, Schlaf eingetragen und alle Supplements genommen (falls vorhanden). */
export function isGreenDay(f: DayAwardFacts): boolean {
  const meals = MAIN_MEAL_NAMES.every(m => f.mealsMain.includes(m))
  const supps = f.supplementsTotal === 0 || f.supplementsTaken >= f.supplementsTotal
  return meals && f.sleep && supps
}

/** Alle Erfolge, die für diesen Tag fällig sind. Jeder hat eine feste Referenz, damit er nur einmal zählt. */
export function dayAwards(f: DayAwardFacts): Award[] {
  const out: Award[] = []
  for (const meal of MAIN_MEAL_NAMES) {
    if (f.mealsMain.includes(meal)) out.push({ quelle: 'mahlzeit', ref: `${f.date}:${meal}`, xp: 6, punkte: 0, titel: `${meal} eingetragen` })
  }
  if (f.sleep) out.push({ quelle: 'schlaf', ref: f.date, xp: 8, punkte: 0, titel: 'Schlaf eingetragen' })
  if (f.weight) out.push({ quelle: 'gewicht', ref: f.date, xp: 5, punkte: 0, titel: 'Gewogen' })
  // Höchstens zwei Einheiten pro Tag zählen
  for (const id of f.trainingIds.slice(0, 2)) out.push({ quelle: 'training', ref: id, xp: 30, punkte: 10, titel: 'Training geschafft' })
  if (f.supplementsTotal > 0 && f.supplementsTaken >= f.supplementsTotal) out.push({ quelle: 'supplements', ref: f.date, xp: 8, punkte: 0, titel: 'Supplements genommen' })
  if (f.waterGoalMl > 0 && f.waterMl >= f.waterGoalMl) out.push({ quelle: 'wasser', ref: f.date, xp: 20, punkte: 10, titel: 'Wasserziel erreicht' })
  if (isGreenDay(f)) out.push({ quelle: 'gruener-tag', ref: f.date, xp: 30, punkte: 20, titel: 'Grüner Tag' })
  return out
}

export function streakAward(days: number, startDate: string): Award | null {
  const r = STREAK_REWARDS[days]
  if (!r) return null
  return { quelle: 'streak', ref: `${days}@${startDate}`, xp: r.xp, punkte: r.punkte, titel: `${days} Tage am Stück` }
}

/** Challenges bringen Punkte und 1,5-fach XP. */
export function challengeAward(id: string, titel: string, punkte: number): Award {
  return { quelle: 'challenge', ref: id, xp: Math.min(500, Math.round(punkte * 1.5)), punkte, titel }
}

export const WELCOME_AWARD: Award = { quelle: 'start', ref: 'willkommen', xp: 0, punkte: 50, titel: 'Willkommensgeschenk' }

// ─── Shop ─────────────────────────────────────────────────────────────────────

export type Slot = 'kleidung' | 'kopf' | 'brille' | 'hals' | 'tier'
export type ShopCategory = 'kleidung' | 'kopf' | 'schmuck' | 'tiere'

export interface ShopItem { id: string; name: string; slot: Slot; kategorie: ShopCategory; preis: number; minLevel: number; text: string }

export const CATEGORY_LABEL: Record<ShopCategory, string> = { kleidung: 'Kleidung', kopf: 'Mützen', schmuck: 'Schmuck', tiere: 'Tiere' }
export const CATEGORY_SLOTS: Record<ShopCategory, Slot[]> = { kleidung: ['kleidung'], kopf: ['kopf'], schmuck: ['brille', 'hals'], tiere: ['tier'] }

export const SHOP: ShopItem[] = [
  { id: 'tank', name: 'Tank-Top', slot: 'kleidung', kategorie: 'kleidung', preis: 40, minLevel: 1, text: 'Luftig fürs Training.' },
  { id: 'hoodie', name: 'Hoodie', slot: 'kleidung', kategorie: 'kleidung', preis: 60, minLevel: 2, text: 'Gemütlich und sportlich.' },
  { id: 'jacket', name: 'Trainingsjacke', slot: 'kleidung', kategorie: 'kleidung', preis: 100, minLevel: 4, text: 'Mit Reißverschluss und Streifen.' },
  { id: 'jersey', name: 'Trikot', slot: 'kleidung', kategorie: 'kleidung', preis: 80, minLevel: 3, text: 'Für den Teamgeist.' },
  { id: 'suit', name: 'Anzug mit Krawatte', slot: 'kleidung', kategorie: 'kleidung', preis: 150, minLevel: 8, text: 'Für besondere Anlässe.' },

  { id: 'headband', name: 'Stirnband', slot: 'kopf', kategorie: 'kopf', preis: 30, minLevel: 1, text: 'Hält den Schweiß fern.' },
  { id: 'cap', name: 'Kappe', slot: 'kopf', kategorie: 'kopf', preis: 40, minLevel: 1, text: 'Der Klassiker.' },
  { id: 'beanie', name: 'Mütze', slot: 'kopf', kategorie: 'kopf', preis: 50, minLevel: 2, text: 'Warm und cool zugleich.' },
  { id: 'cowboy', name: 'Cowboyhut', slot: 'kopf', kategorie: 'kopf', preis: 120, minLevel: 6, text: 'Yeehaw!' },
  { id: 'crown', name: 'Krone', slot: 'kopf', kategorie: 'kopf', preis: 400, minLevel: 15, text: 'Für echte Champions.' },

  { id: 'glasses', name: 'Brille', slot: 'brille', kategorie: 'schmuck', preis: 50, minLevel: 1, text: 'Schlau und stylisch.' },
  { id: 'sunglasses', name: 'Sonnenbrille', slot: 'brille', kategorie: 'schmuck', preis: 70, minLevel: 2, text: 'Cool bleiben.' },
  { id: 'scarf', name: 'Schal', slot: 'hals', kategorie: 'schmuck', preis: 60, minLevel: 2, text: 'Kuschelig um den Hals.' },
  { id: 'medal', name: 'Medaille', slot: 'hals', kategorie: 'schmuck', preis: 150, minLevel: 5, text: 'Du hast sie dir verdient.' },
  { id: 'goldchain', name: 'Goldkette', slot: 'hals', kategorie: 'schmuck', preis: 200, minLevel: 7, text: 'Glänzt wie dein Fortschritt.' },

  { id: 'turtle', name: 'Schildkröte', slot: 'tier', kategorie: 'tiere', preis: 120, minLevel: 2, text: 'Langsam und stetig zum Ziel.' },
  { id: 'bunny', name: 'Hase', slot: 'tier', kategorie: 'tiere', preis: 160, minLevel: 3, text: 'Immer in Bewegung.' },
  { id: 'dog', name: 'Hund', slot: 'tier', kategorie: 'tiere', preis: 180, minLevel: 4, text: 'Dein Trainingspartner.' },
  { id: 'cat', name: 'Katze', slot: 'tier', kategorie: 'tiere', preis: 180, minLevel: 4, text: 'Gelassen und elegant.' },
  { id: 'fox', name: 'Fuchs', slot: 'tier', kategorie: 'tiere', preis: 260, minLevel: 9, text: 'Schlau und flink.' },
]

export const itemById = (id: string) => SHOP.find(i => i.id === id)

export type ItemState = 'owned' | 'buyable' | 'poor' | 'locked'

/** Kaufstatus eines Gegenstands: schon gekauft, kaufbar, zu wenig Punkte oder Level zu niedrig. */
export function itemState(item: ShopItem, owned: Set<string>, level: number, points: number): ItemState {
  if (owned.has(item.id)) return 'owned'
  if (level < item.minLevel) return 'locked'
  return points >= item.preis ? 'buyable' : 'poor'
}

export type Equipped = Partial<Record<Slot, string>>

/** Anziehen: derselbe Platz wird ersetzt; erneut tippen zieht es wieder aus. */
export function toggleEquip(eq: Equipped, item: ShopItem): Equipped {
  const next = { ...eq }
  if (next[item.slot] === item.id) delete next[item.slot]
  else next[item.slot] = item.id
  return next
}

// ─── Challenges ───────────────────────────────────────────────────────────────

export type ChallengeCategory = 'draussen' | 'koerper' | 'erholung' | 'selfcare' | 'sozial' | 'fokus'
export interface ChallengeDef { id: string; titel: string; text: string; kategorie: ChallengeCategory; punkte: number }

export const CHALLENGE_CATEGORIES: { key: ChallengeCategory; label: string; emoji: string }[] = [
  { key: 'draussen', label: 'Draußen & Bewegung', emoji: '🌤️' },
  { key: 'koerper', label: 'Essen & Körper', emoji: '🥗' },
  { key: 'erholung', label: 'Schlaf & Erholung', emoji: '🌙' },
  { key: 'selfcare', label: 'Für dich selbst', emoji: '💚' },
  { key: 'sozial', label: 'Miteinander', emoji: '🤝' },
  { key: 'fokus', label: 'Kopf & Fokus', emoji: '🎯' },
]

const c = (id: string, kategorie: ChallengeCategory, punkte: number, titel: string, text: string): ChallengeDef => ({ id, kategorie, punkte, titel, text })

export const CHALLENGES: ChallengeDef[] = [
  c('frische-luft', 'draussen', 15, 'Frische Luft', 'Geh heute 20 Minuten draußen spazieren.'),
  c('sonne-tanken', 'draussen', 15, 'Sonne tanken', 'Verbringe 15 Minuten draußen im Tageslicht, ohne Handy.'),
  c('zehntausend', 'draussen', 25, '10.000 Schritte', 'Erreiche heute 10.000 Schritte.'),
  c('neue-strecke', 'draussen', 25, 'Neue Strecke', 'Geh oder lauf eine Strecke, die du noch nie gegangen bist.'),
  c('treppe', 'draussen', 10, 'Treppe statt Lift', 'Nimm heute überall die Treppe.'),
  c('morgenrunde', 'draussen', 15, 'Morgenrunde', 'Geh vor dem Frühstück 10 Minuten raus.'),
  c('mittagsrunde', 'draussen', 15, 'Mittagsspaziergang', 'Mach in der Mittagspause einen Spaziergang.'),
  c('aufs-rad', 'draussen', 20, 'Aufs Rad', 'Fahr heute mit dem Rad statt mit dem Auto oder Bus.'),
  c('natur-moment', 'draussen', 15, 'Natur-Moment', 'Such dir draußen einen schönen Ort und mach ein Foto davon.'),
  c('draussen-dehnen', 'draussen', 10, 'Dehnen im Freien', 'Dehne 10 Minuten, am besten draußen.'),
  c('sonnenuntergang', 'draussen', 15, 'Himmel genießen', 'Schau dir heute den Sonnenuntergang oder Sonnenaufgang an.'),
  c('park-workout', 'draussen', 30, 'Park-Workout', 'Mach draußen 3 Runden: 10 Kniebeugen und 10 Liegestütze.'),

  c('regenbogen', 'koerper', 20, 'Regenbogenteller', 'Iss heute Gemüse in drei verschiedenen Farben.'),
  c('wasser-zuerst', 'koerper', 10, 'Wasser zuerst', 'Trink morgens ein großes Glas Wasser, bevor du Kaffee trinkst.'),
  c('zuckerfrei', 'koerper', 20, 'Ohne Süßgetränke', 'Verzichte heute auf zuckerhaltige Getränke.'),
  c('selbst-gekocht', 'koerper', 25, 'Selbst gekocht', 'Koch heute eine Mahlzeit komplett selbst.'),
  c('eiweiss-frueh', 'koerper', 15, 'Eiweiß am Start', 'Iss zum Frühstück eine Eiweißquelle.'),
  c('achtsam-essen', 'koerper', 20, 'Achtsam essen', 'Iss heute eine Mahlzeit ohne Handy und Fernseher, mit voller Aufmerksamkeit.'),
  c('neues-gemuese', 'koerper', 20, 'Neues Gemüse', 'Probiere ein Gemüse, das du lange nicht gegessen hast.'),
  c('meal-prep', 'koerper', 30, 'Meal Prep', 'Bereite zwei Mahlzeiten für die nächsten Tage vor.'),
  c('obst-snack', 'koerper', 10, 'Obst als Snack', 'Ersetze heute einen Snack durch Obst.'),
  c('ohne-alkohol', 'koerper', 20, 'Ohne Alkohol', 'Verzichte heute auf Alkohol.'),
  c('zeit-fruehstueck', 'koerper', 10, 'Zeit fürs Frühstück', 'Nimm dir 15 Minuten fürs Frühstück.'),
  c('bunte-bowl', 'koerper', 25, 'Bunte Bowl', 'Bau dir eine Bowl mit Protein, Gemüse und gesunden Fetten.'),

  c('handy-weg', 'erholung', 20, 'Handy weg', 'Leg dein Handy 30 Minuten vor dem Schlafen weg.'),
  c('feste-zeit', 'erholung', 15, 'Feste Schlafenszeit', 'Geh heute zur gleichen Zeit ins Bett wie gestern.'),
  c('lueften', 'erholung', 10, 'Frische im Schlafzimmer', 'Lüfte vor dem Schlafen dein Schlafzimmer.'),
  c('abendritual', 'erholung', 20, 'Abendritual', 'Gönn dir 10 Minuten Ruhe: Tee, Lesen oder Dehnen.'),
  c('kein-koffein', 'erholung', 15, 'Kein Koffein ab Mittag', 'Trink nach 14 Uhr keinen Kaffee.'),
  c('acht-stunden', 'erholung', 25, 'Acht Stunden', 'Schlaf heute mindestens 8 Stunden.'),
  c('ruhetag', 'erholung', 20, 'Bewusster Ruhetag', 'Gönn dir heute einen Erholungstag und plane etwas Entspanntes.'),
  c('atemuebung', 'erholung', 15, 'Atemübung', 'Atme 5 Minuten ruhig: 4 Sekunden ein, 6 Sekunden aus.'),
  c('warmes-bad', 'erholung', 15, 'Warmes Bad', 'Nimm dir Zeit für ein warmes Bad oder eine lange Dusche.'),
  c('kurze-pause', 'erholung', 10, 'Kurze Auszeit', 'Mach 20 Minuten Pause mit geschlossenen Augen.'),

  c('dankbarkeit', 'selfcare', 15, 'Dankbarkeit', 'Schreib drei Dinge auf, für die du heute dankbar bist.'),
  c('nur-fuer-mich', 'selfcare', 25, 'Nur für mich', 'Tu etwas Schönes nur für dich, das nichts mit Training zu tun hat.'),
  c('lieblingsmusik', 'selfcare', 10, 'Lieblingsmusik', 'Hör dein Lieblingslied und genieß es 5 Minuten lang.'),
  c('buch', 'selfcare', 15, 'Lesezeit', 'Lies 20 Minuten in einem Buch.'),
  c('kreativ', 'selfcare', 20, 'Kreativ sein', 'Zeichne, schreib, koch oder bastle etwas.'),
  c('digital-detox', 'selfcare', 20, 'Digital Detox', 'Bleib eine Stunde ohne Social Media.'),
  c('spiegel', 'selfcare', 15, 'Stark im Spiegel', 'Sag dir vor dem Spiegel drei Dinge, die du an dir magst.'),
  c('stolz', 'selfcare', 15, 'Stolz-Moment', 'Schreib auf, worauf du diese Woche stolz bist.'),
  c('aufraeumen', 'selfcare', 15, 'Aufräumen', 'Räume einen Ort auf, der dich stört: Schreibtisch, Tasche oder Schrank.'),
  c('neues-lernen', 'selfcare', 15, 'Etwas Neues lernen', 'Lerne ein neues Wort, ein Rezept oder einen spannenden Fakt.'),
  c('wohlfuehl-outfit', 'selfcare', 10, 'Wohlfühl-Outfit', 'Zieh heute etwas an, in dem du dich richtig wohlfühlst.'),
  c('ziel-morgen', 'selfcare', 10, 'Ziel für morgen', 'Schreib ein kleines Ziel für morgen auf.'),
  c('bildschirmpause', 'selfcare', 10, 'Bildschirmpause', 'Mach 15 Minuten Pause ohne Bildschirm.'),
  c('laecheln', 'selfcare', 10, 'Lächeln verschenken', 'Schenk heute drei Menschen ein ehrliches Lächeln.'),

  c('nachricht', 'sozial', 15, 'Liebe Nachricht', 'Schreib einer Person, die dir wichtig ist, eine liebe Nachricht.'),
  c('gemeinsam-bewegen', 'sozial', 25, 'Gemeinsam bewegen', 'Beweg dich heute zusammen mit jemandem.'),
  c('gefallen', 'sozial', 20, 'Kleiner Gefallen', 'Tu jemandem heute einen kleinen Gefallen.'),
  c('anrufen', 'sozial', 20, 'Anrufen', 'Ruf jemanden an, den du länger nicht gehört hast.'),
  c('gemeinsam-essen', 'sozial', 25, 'Gemeinsam essen', 'Koch oder iss heute mit anderen zusammen.'),
  c('danke-sagen', 'sozial', 15, 'Danke sagen', 'Bedank dich heute bei jemandem ganz bewusst.'),
  c('hilfe-holen', 'sozial', 20, 'Um Rat fragen', 'Frag jemanden um Rat oder Unterstützung bei etwas, das dir schwerfällt.'),
  c('coach-update', 'sozial', 20, 'Update an den Coach', 'Schreib deinem Coach, wie es dir diese Woche geht.'),

  c('frosch', 'fokus', 25, 'Der Frosch zuerst', 'Erledige heute zuerst die Aufgabe, die du gern aufschiebst.'),
  c('wochenplan', 'fokus', 20, 'Wochenplan', 'Plane deine Trainingswoche im Kalender.'),
  c('meditation', 'fokus', 15, 'Fünf Minuten Ruhe', 'Meditiere 5 Minuten, zum Beispiel mit einer App.'),
  c('reflexion', 'fokus', 20, 'Reflexion', 'Schreib auf, was diese Woche gut lief und was du ändern willst.'),
  c('fokuszeit', 'fokus', 20, 'Fokuszeit', 'Arbeite 25 Minuten konzentriert an einer Sache, ohne Ablenkung.'),
  c('rueckblick', 'fokus', 15, 'Fortschritt ansehen', 'Schau dir deine Zahlen oder Fotos der letzten Wochen an.'),
]

export const challengeById = (id: string) => CHALLENGES.find(x => x.id === id)

/** ISO-Woche als Schlüssel („2026-W41“): jede Challenge zählt höchstens einmal pro Woche. */
export function weekKey(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7 // Montag = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // Donnerstag der Woche
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export const MAX_CHALLENGES_PER_DAY = 3

/** Drei Vorschläge für den Tag: täglich neu, aus verschiedenen Bereichen, schon erledigte (diese Woche) bleiben draußen. */
export function dailySuggestions(dateISO: string, doneThisWeek: Set<string>): ChallengeDef[] {
  let seed = 0
  for (const ch of dateISO) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const order = CHALLENGE_CATEGORIES.map(x => x.key)
  // Reihenfolge der Bereiche pro Tag durchmischen, dann je Bereich eine Challenge ziehen
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  const out: ChallengeDef[] = []
  for (const cat of order) {
    const pool = CHALLENGES.filter(x => x.kategorie === cat && !doneThisWeek.has(x.id))
    if (pool.length) out.push(pool[Math.floor(rnd() * pool.length)])
    if (out.length === 3) break
  }
  return out
}

// ─── Belohnungen ──────────────────────────────────────────────────────────────

export interface RewardIdea { titel: string; preis: number; emoji: string }

export const REWARD_IDEAS: RewardIdea[] = [
  { titel: 'Eine Kugel Eis', preis: 80, emoji: '🍦' },
  { titel: 'Ein Stück Kuchen', preis: 100, emoji: '🍰' },
  { titel: '30 Minuten mehr Bildschirmzeit', preis: 60, emoji: '📱' },
  { titel: 'Eine Serienfolge am Abend', preis: 50, emoji: '📺' },
  { titel: 'Am Wochenende ausschlafen', preis: 120, emoji: '😴' },
  { titel: 'Ein freier Abend ohne Plan', preis: 150, emoji: '🌇' },
  { titel: 'Pizza-Abend', preis: 200, emoji: '🍕' },
  { titel: 'Neue Trainings-Playlist', preis: 70, emoji: '🎧' },
  { titel: 'Kino-Abend', preis: 250, emoji: '🎬' },
  { titel: 'Lieblingsessen im Restaurant', preis: 350, emoji: '🍽️' },
  { titel: 'Massage oder Sauna', preis: 300, emoji: '💆' },
  { titel: 'Neues Sportoutfit', preis: 600, emoji: '👟' },
]

export const MAX_NAME = 16
export function cleanName(v: string): string { return v.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) }
