// Entscheidungslogik für Push-Nachrichten. Reine Funktionen ohne Datenbank und Netzwerk,
// damit sie sich mit `npm run test:reminders` prüfen lassen. Die Edge Function send-reminders ruft sie auf.

export type HabitKind = 'missing' | 'praise' | 'streak' | 'water'
export const HABIT_KINDS: string[] = ['missing', 'praise', 'streak', 'water']

export interface Settings {
  timezone?: string | null
  notif_daily_reminder?: boolean | null
  notif_reminder_time?: string | null // lokale Uhrzeit „HH:MM“
  notif_appointments?: boolean | null
  notif_appointment_minutes?: number | null
  notif_praise?: boolean | null
  notif_streak?: boolean | null
  notif_water?: boolean | null
  notif_max_per_day?: number | null
  wasser_ziel_ml?: number | null
}

/** Was der Nutzer am lokalen Tag bereits eingetragen hat. */
export interface DayFacts {
  weight: boolean
  sleep: boolean
  training: boolean
  trainingMin?: number | null
  trainingType?: string | null
  trainingAt?: string | null // ISO-Zeitstempel (created_at) der letzten Einheit des Tages
  mealsMain: number // Frühstück, Mittag, Abend (0–3)
  supplementsTotal: number
  supplementsTaken: number
  waterMl: number
}

export interface SentRecord { kind: string; ref: string }

export interface Candidate {
  kind: HabitKind | 'appointment'
  ref: string
  title: string
  body: string
  url: string
}

export const WINDOW_START_MIN = 8 * 60 // vor 08:00 keine Gewohnheits-Nachrichten
export const WINDOW_END_MIN = 22 * 60 // ab 22:00 auch nicht mehr
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 300, 365, 500, 730, 1000]
export const DEFAULT_TZ = 'Europe/Berlin'

// ─── Zeit ─────────────────────────────────────────────────────────────────────

export function safeTz(tz?: string | null): string {
  if (!tz) return DEFAULT_TZ
  try { new Intl.DateTimeFormat('de-DE', { timeZone: tz }); return tz } catch { return DEFAULT_TZ }
}

/** Lokales Datum (YYYY-MM-DD) und Minuten seit Mitternacht in der Zeitzone. */
export function localParts(now: Date, tz: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${get('year')}-${pad(get('month'))}-${pad(get('day'))}`, minutes: get('hour') * 60 + get('minute') }
}

/** Versatz der Zeitzone zu UTC in Millisekunden zu einem Zeitpunkt (positiv = östlich von UTC). */
function tzOffsetMs(at: Date, tz: string): number {
  const p = localParts(at, tz)
  const [y, m, d] = p.date.split('-').map(Number)
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(p.minutes / 60), p.minutes % 60)
  return asUtc - Math.floor(at.getTime() / 60000) * 60000
}

/** Wandelt Datum und Uhrzeit in lokaler Zeit in einen UTC-Zeitpunkt um (berücksichtigt Sommerzeit). */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm || 0)
  let t = guess - tzOffsetMs(new Date(guess), tz)
  t = guess - tzOffsetMs(new Date(t), tz) // zweiter Durchgang fängt Sommerzeit-Wechsel ab
  return new Date(t)
}

export function parseHHMM(v: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '')
  if (!m) return fallback
  const h = Number(m[1]), mi = Number(m[2])
  return h > 23 || mi > 59 ? fallback : h * 60 + mi
}

export function addDaysISO(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

// ─── Streak ───────────────────────────────────────────────────────────────────

/** Aufeinanderfolgende Tage mit Eintrag; hat heute noch keinen, zählt es ab gestern (wie im Dashboard). */
export function streakDays(dates: Set<string>, today: string): { days: number; includesToday: boolean } {
  const includesToday = dates.has(today)
  let d = includesToday ? today : addDaysISO(today, -1)
  let days = 0
  while (dates.has(d)) { days++; d = addDaysISO(d, -1) }
  return { days, includesToday }
}

// ─── Gewohnheits-Nachrichten ──────────────────────────────────────────────────

export function missingItems(f: DayFacts): string[] {
  const out: string[] = []
  if (f.mealsMain < 3) out.push('Ernährung')
  if (!f.sleep) out.push('Schlaf')
  if (f.supplementsTotal > 0 && f.supplementsTaken < f.supplementsTotal) out.push('Supplements')
  return out
}

export function hasAnyEntry(f: DayFacts): boolean {
  return f.weight || f.sleep || f.training || f.mealsMain > 0 || f.supplementsTaken > 0 || f.waterMl > 0
}

function joinDe(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`
}

const liters = (ml: number) => (ml / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })

/** Lohnt sich die (teurere) Streak-Abfrage jetzt? Nur einmal pro Tag nach dem ersten Eintrag und vor der Abend-Erinnerung. */
export function needsStreak(now: Date, settings: Settings, facts: DayFacts, sent: SentRecord[]): boolean {
  const { minutes } = localParts(now, safeTz(settings.timezone))
  if (minutes < WINDOW_START_MIN || minutes >= WINDOW_END_MIN) return false
  const checked = sent.some(r => r.kind === 'streak-checked')
  const milestone = settings.notif_streak !== false && hasAnyEntry(facts) && !checked
  const evening = settings.notif_daily_reminder !== false
    && minutes >= parseHHMM(settings.notif_reminder_time, 20 * 60) && !sent.some(r => r.kind === 'missing')
  return milestone || evening
}

export interface HabitInput {
  now: Date
  settings: Settings
  facts: DayFacts
  streak: { days: number; includesToday: boolean }
  sent: SentRecord[] // heute (lokaler Tag) schon verschickte Gewohnheits-Nachrichten
  appUrl: string
}

/** Welche Gewohnheits-Nachrichten sind jetzt fällig? Berücksichtigt Zeitfenster und Tageslimit. */
export function decideHabitPushes(input: HabitInput): Candidate[] {
  const { now, settings: s, facts, streak, sent, appUrl } = input
  const tz = safeTz(s.timezone)
  const { date, minutes } = localParts(now, tz)
  if (minutes < WINDOW_START_MIN || minutes >= WINDOW_END_MIN) return []

  const max = Math.min(3, Math.max(1, s.notif_max_per_day ?? 3))
  const has = (kind: string, ref?: string) => sent.some(r => r.kind === kind && (ref === undefined || r.ref === ref))
  let used = sent.filter(r => HABIT_KINDS.includes(r.kind)).length
  const out: Candidate[] = []
  // Praise und Wasser lassen immer einen Platz für „Noch nichts eingetragen“ und Serien frei
  const canUse = (kind: HabitKind) => (kind === 'missing' || kind === 'streak' ? used < max : used < max - 1)
  const take = (c: Candidate & { kind: HabitKind }) => { out.push(c); used++ }

  const reminderAt = parseHHMM(s.notif_reminder_time, 20 * 60)
  const missing = missingItems(facts)

  // 1) Noch nichts eingetragen / es fehlt noch etwas (zur Erinnerungszeit)
  if (s.notif_daily_reminder !== false && minutes >= reminderAt && !has('missing') && canUse('missing')) {
    const serie = streak.days >= 3 ? ` Deine ${streak.days}-Tage-Serie wartet auf dich.` : ''
    if (!hasAnyEntry(facts)) {
      take({ kind: 'missing', ref: date, title: 'Heute noch nichts eingetragen', body: `Ein kurzer Eintrag reicht: Essen, Schlaf oder Gewicht.${serie}`, url: `${appUrl}#/dashboard` })
    } else if (missing.length > 0) {
      take({ kind: 'missing', ref: date, title: 'Fast geschafft', body: `Heute fehlt dir noch: ${joinDe(missing)}.${serie}`, url: `${appUrl}#/dashboard` })
    }
  }

  // 2) Serie und Meilensteine (nur wenn heute etwas eingetragen ist)
  if (s.notif_streak !== false && streak.includesToday && STREAK_MILESTONES.includes(streak.days)
      && !has('streak', `${streak.days}@${addDaysISO(date, -(streak.days - 1))}`) && canUse('streak')) {
    const n = streak.days
    const text = n >= 100 ? 'Das ist Disziplin auf Profi-Niveau.' : n >= 30 ? 'Ein ganzer Monat Routine, richtig stark.' : n >= 7 ? 'Genau so entstehen Gewohnheiten.' : 'Der Anfang ist gemacht, bleib dran.'
    // Die Referenz enthält den Starttag der Serie: nach einer Pause darf derselbe Meilenstein wieder gefeiert werden
    take({ kind: 'streak', ref: `${n}@${addDaysISO(date, -(n - 1))}`, title: `${n} Tage am Stück`, body: text, url: `${appUrl}#/dashboard` })
  }

  // 3) Lob: einmal pro Tag. Zuerst fürs Training (frühestens 10 Minuten nach dem Eintrag), sonst am Abend für alles Erledigte.
  if (s.notif_praise !== false && !has('praise') && canUse('praise')) {
    const trainedLongEnough = facts.training && (!facts.trainingAt || now.getTime() - new Date(facts.trainingAt).getTime() >= 10 * 60000)
    if (trainedLongEnough) {
      const dauer = facts.trainingMin ? `${facts.trainingMin} Minuten ` : ''
      const typ = facts.trainingType ? `${facts.trainingType}` : 'Training'
      take({ kind: 'praise', ref: `train:${date}`, title: 'Heute schon fleißig trainiert', body: `${dauer}${typ}, stark gemacht. Gönn dir jetzt Erholung und genug Eiweiß.`, url: `${appUrl}#/training` })
    } else if (minutes >= 17 * 60 && hasAnyEntry(facts) && missing.length === 0 && (facts.weight || facts.sleep || facts.mealsMain >= 3)) {
      take({ kind: 'praise', ref: `all:${date}`, title: 'Alles eingetragen', body: 'Starker Tag, du bist komplett dabei.', url: `${appUrl}#/dashboard` })
    }
  }

  // 4) Wasser: nachmittags, wenn erst wenig getrunken wurde
  const goal = s.wasser_ziel_ml ?? 0
  if (s.notif_water !== false && goal > 0 && minutes >= 15 * 60 && minutes < 19 * 60 && facts.waterMl < goal * 0.5 && !has('water') && canUse('water')) {
    take({ kind: 'water', ref: date, title: 'Zeit für ein Glas Wasser', body: `Bisher ${liters(facts.waterMl)} l von ${liters(goal)} l. Ein Glas jetzt tut dir gut.`, url: `${appUrl}#/nutrition` })
  }

  return out
}

// ─── Termin-Erinnerungen ──────────────────────────────────────────────────────

export interface EventRow {
  id: string
  titel: string
  datum: string // lokales Datum
  uhrzeit: string | null // lokale Uhrzeit
  erinnerung_min?: number | null // null = Standard aus den Einstellungen, 0 = keine Erinnerung
  vorlage_name?: string | null
}

export function leadText(min: number): string {
  if (min >= 1440 && min % 1440 === 0) return min === 1440 ? 'morgen' : `in ${min / 1440} Tagen`
  if (min >= 60 && min % 60 === 0) return min === 60 ? 'in 1 Stunde' : `in ${min / 60} Stunden`
  return `in ${min} Minuten`
}

/** Termine, an die jetzt erinnert werden soll (noch nicht begonnen, Erinnerungszeit erreicht, noch nicht verschickt). */
export function decideAppointmentPushes(
  events: EventRow[], now: Date, settings: Settings, sent: SentRecord[], appUrl: string,
): Candidate[] {
  if (settings.notif_appointments === false) return []
  const tz = safeTz(settings.timezone)
  const out: Candidate[] = []
  for (const ev of events) {
    if (!ev.uhrzeit) continue
    const lead = ev.erinnerung_min ?? settings.notif_appointment_minutes ?? 60
    if (lead <= 0) continue
    const start = zonedToUtc(ev.datum, ev.uhrzeit.slice(0, 5), tz)
    const remindAt = start.getTime() - lead * 60000
    if (now.getTime() < remindAt || now.getTime() >= start.getTime()) continue
    if (sent.some(r => r.kind === 'appointment' && r.ref === ev.id)) continue
    const when = leadText(lead)
    out.push({
      kind: 'appointment', ref: ev.id,
      title: `Termin ${when}`,
      body: `${ev.titel} um ${ev.uhrzeit.slice(0, 5)} Uhr${ev.vorlage_name ? ` · Vorlage: ${ev.vorlage_name}` : ''}`,
      url: `${appUrl}#/calendar`,
    })
  }
  return out
}
