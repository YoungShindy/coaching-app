// Tests der Push-Logik: `npm run test:reminders`
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  localParts, zonedToUtc, streakDays, decideHabitPushes, decideAppointmentPushes, leadText, parseHHMM, needsStreak,
  type DayFacts, type Settings, type SentRecord,
} from './reminders.ts'

const APP = 'https://example.test/coaching-app/'
const empty: DayFacts = { weight: false, sleep: false, training: false, mealsMain: 0, supplementsTotal: 0, supplementsTaken: 0, waterMl: 0 }
const iso = (s: string) => new Date(s)
const base: Settings = { timezone: 'Europe/Berlin', notif_daily_reminder: true, notif_reminder_time: '20:00', wasser_ziel_ml: 2500 }
const noStreak = { days: 0, includesToday: false }
const run = (over: { now: string; settings?: Settings; facts?: Partial<DayFacts>; streak?: { days: number; includesToday: boolean }; sent?: SentRecord[] }) =>
  decideHabitPushes({
    now: iso(over.now), settings: { ...base, ...over.settings }, facts: { ...empty, ...over.facts },
    streak: over.streak ?? noStreak, sent: over.sent ?? [], appUrl: APP,
  })

test('Zeitzone: lokale Zeit im Sommer und Winter', () => {
  assert.deepEqual(localParts(iso('2026-07-01T18:30:00Z'), 'Europe/Berlin'), { date: '2026-07-01', minutes: 20 * 60 + 30 })
  assert.deepEqual(localParts(iso('2026-01-15T19:00:00Z'), 'Europe/Berlin'), { date: '2026-01-15', minutes: 20 * 60 })
  // Kurz nach Mitternacht lokal ist in UTC noch der Vortag
  assert.deepEqual(localParts(iso('2026-07-01T22:30:00Z'), 'Europe/Berlin'), { date: '2026-07-02', minutes: 30 })
  assert.deepEqual(localParts(iso('2026-07-01T12:00:00Z'), 'America/New_York'), { date: '2026-07-01', minutes: 8 * 60 })
})

test('Zeitzone: lokale Zeit nach UTC (inkl. Sommerzeit-Wechsel)', () => {
  assert.equal(zonedToUtc('2026-07-01', '17:30', 'Europe/Berlin').toISOString(), '2026-07-01T15:30:00.000Z')
  assert.equal(zonedToUtc('2026-01-15', '17:30', 'Europe/Berlin').toISOString(), '2026-01-15T16:30:00.000Z')
  assert.equal(zonedToUtc('2026-03-29', '03:30', 'Europe/Berlin').toISOString(), '2026-03-29T01:30:00.000Z')
  assert.equal(zonedToUtc('2026-03-29', '01:30', 'Europe/Berlin').toISOString(), '2026-03-29T00:30:00.000Z')
  assert.equal(zonedToUtc('2026-10-25', '12:00', 'Europe/Berlin').toISOString(), '2026-10-25T11:00:00.000Z')
  assert.equal(zonedToUtc('2026-07-01', '08:00', 'America/New_York').toISOString(), '2026-07-01T12:00:00.000Z')
})

test('Uhrzeit lesen', () => {
  assert.equal(parseHHMM('20:30', 0), 1230)
  assert.equal(parseHHMM('07:05:00', 0), 425)
  assert.equal(parseHHMM('abc', 99), 99)
  assert.equal(parseHHMM('25:00', 99), 99)
})

test('Streak zählt ab heute oder gestern', () => {
  const d = new Set(['2026-07-01', '2026-06-30', '2026-06-29', '2026-06-27'])
  assert.deepEqual(streakDays(d, '2026-07-01'), { days: 3, includesToday: true })
  assert.deepEqual(streakDays(d, '2026-07-02'), { days: 3, includesToday: false })
  assert.deepEqual(streakDays(d, '2026-07-04'), { days: 0, includesToday: false })
})

test('Noch nichts eingetragen: nur ab Erinnerungszeit und im Zeitfenster', () => {
  // 17:55 UTC = 19:55 Berlin (Sommer): noch zu früh
  assert.equal(run({ now: '2026-07-01T17:55:00Z' }).length, 0)
  const r = run({ now: '2026-07-01T18:05:00Z' })
  assert.equal(r.length, 1)
  assert.equal(r[0].kind, 'missing')
  assert.equal(r[0].title, 'Heute noch nichts eingetragen')
  // 20:05 UTC = 22:05 Berlin: Ruhezeit
  assert.equal(run({ now: '2026-07-01T20:05:00Z' }).length, 0)
  // Erinnerungszeit 22:00 liegt schon außerhalb des Fensters
  assert.equal(run({ now: '2026-07-01T20:05:00Z', settings: { ...base, notif_reminder_time: '22:00' } }).length, 0)
})

test('Winterzeit: 20:00 Uhr lokal ist 19:00 UTC', () => {
  assert.equal(run({ now: '2026-01-15T18:55:00Z' }).length, 0)
  assert.equal(run({ now: '2026-01-15T19:05:00Z' }).length, 1)
})

test('Teilweise eingetragen: nennt, was fehlt', () => {
  const r = run({ now: '2026-07-01T18:05:00Z', facts: { weight: true, mealsMain: 2, sleep: false, supplementsTotal: 3, supplementsTaken: 1 } })
  assert.equal(r.length, 1)
  assert.equal(r[0].title, 'Fast geschafft')
  assert.match(r[0].body, /Ernährung, Schlaf und Supplements/)
})

test('Alles erledigt: keine Erinnerung, abends Lob', () => {
  const facts = { weight: true, sleep: true, mealsMain: 3, supplementsTotal: 2, supplementsTaken: 2 }
  const r = run({ now: '2026-07-01T18:05:00Z', facts })
  assert.deepEqual(r.map(c => c.kind), ['praise'])
  assert.equal(r[0].title, 'Alles eingetragen')
})

test('Serie erwähnt in der Erinnerung', () => {
  const r = run({ now: '2026-07-01T18:05:00Z', streak: { days: 12, includesToday: false } })
  assert.match(r[0].body, /12-Tage-Serie/)
})

test('Nichts doppelt: bereits verschickte Nachrichten werden übersprungen', () => {
  const sent: SentRecord[] = [{ kind: 'missing', ref: '2026-07-01' }]
  assert.equal(run({ now: '2026-07-01T18:05:00Z', sent }).length, 0)
})

test('Lob fürs Training erst nach 10 Minuten und nur einmal', () => {
  const facts = { training: true, trainingMin: 45, trainingType: 'Krafttraining', trainingAt: '2026-07-01T10:00:00Z' }
  assert.equal(run({ now: '2026-07-01T10:05:00Z', facts }).length, 0) // zu früh
  const r = run({ now: '2026-07-01T10:20:00Z', facts })
  assert.equal(r.length, 1)
  assert.equal(r[0].title, 'Heute schon fleißig trainiert')
  assert.match(r[0].body, /45 Minuten Krafttraining/)
  assert.equal(run({ now: '2026-07-01T10:20:00Z', facts, sent: [{ kind: 'praise', ref: 'train:2026-07-01' }] }).length, 0)
})

test('Serien-Meilenstein nur an Meilensteinen und mit heutigem Eintrag', () => {
  const at = '2026-07-01T10:00:00Z'
  const m = run({ now: at, streak: { days: 7, includesToday: true } })
  assert.deepEqual(m.map(c => c.kind), ['streak'])
  assert.equal(m[0].ref, '7@2026-06-25') // Starttag der Serie
  assert.equal(run({ now: at, streak: { days: 8, includesToday: true } }).length, 0)
  assert.equal(run({ now: at, streak: { days: 7, includesToday: false } }).length, 0)
  assert.equal(run({ now: at, streak: { days: 7, includesToday: true }, sent: [{ kind: 'streak', ref: '7@2026-06-25' }] }).length, 0)
  assert.equal(run({ now: at, streak: { days: 7, includesToday: true }, settings: { ...base, notif_streak: false } }).length, 0)
})

test('Wasser: nur nachmittags und nur bei zu wenig getrunken', () => {
  const t = '2026-07-01T14:00:00Z' // 16:00 Berlin
  const r = run({ now: t, facts: { waterMl: 600 } })
  assert.deepEqual(r.map(c => c.kind), ['water'])
  assert.match(r[0].body, /0,6 l von 2,5 l/)
  assert.equal(run({ now: t, facts: { waterMl: 1500 } }).length, 0)
  assert.equal(run({ now: '2026-07-01T09:00:00Z', facts: {} }).length, 0) // 11:00
  assert.equal(run({ now: t, facts: { waterMl: 100 }, settings: { ...base, notif_water: false } }).length, 0)
  assert.equal(run({ now: t, facts: { waterMl: 100 }, settings: { ...base, wasser_ziel_ml: null } }).length, 0)
})

test('Höchstens 3 pro Tag, wichtige zuerst', () => {
  const sent3: SentRecord[] = [{ kind: 'water', ref: 'a' }, { kind: 'praise', ref: 'b' }, { kind: 'streak', ref: '3@x' }]
  assert.equal(run({ now: '2026-07-01T18:05:00Z', sent: sent3 }).length, 0)
  // Zwei verschickt, drittes Slot gehört „Noch nichts eingetragen“, nicht dem Wasser
  const sent2: SentRecord[] = [{ kind: 'praise', ref: 'x' }, { kind: 'streak', ref: '3@x' }]
  assert.deepEqual(run({ now: '2026-07-01T18:05:00Z', sent: sent2 }).map(c => c.kind), ['missing'])
  assert.equal(run({ now: '2026-07-01T14:00:00Z', sent: sent2, facts: { waterMl: 100 } }).length, 0)
})

test('Einstellung „höchstens 1 pro Tag“ lässt nur Wichtiges durch', () => {
  const s = { ...base, notif_max_per_day: 1 }
  assert.equal(run({ now: '2026-07-01T14:00:00Z', settings: s, facts: { waterMl: 100 } }).length, 0)
  assert.deepEqual(run({ now: '2026-07-01T18:05:00Z', settings: s }).map(c => c.kind), ['missing'])
})

test('Abschalten: Gesamtschalter und einzelne Arten', () => {
  assert.equal(run({ now: '2026-07-01T18:05:00Z', settings: { ...base, notif_daily_reminder: false } }).length, 0)
  const facts = { training: true, trainingAt: '2026-07-01T08:00:00Z' }
  assert.equal(run({ now: '2026-07-01T10:00:00Z', facts, settings: { ...base, notif_praise: false } }).length, 0)
})

// ─── Termine ──────────────────────────────────────────────────────────────────

const ev = { id: 'e1', titel: 'Upper Body', datum: '2026-07-01', uhrzeit: '17:30:00', vorlage_name: 'Push-Tag' }
const appt = (now: string, over: Partial<typeof ev & { erinnerung_min: number | null }> = {}, s: Settings = base, sent: SentRecord[] = []) =>
  decideAppointmentPushes([{ ...ev, ...over }], iso(now), s, sent, APP)

test('Termin: Standard 1 Stunde vorher, nicht davor, nicht danach', () => {
  // Start 17:30 Berlin = 15:30 UTC, Erinnerung ab 14:30 UTC
  assert.equal(appt('2026-07-01T14:29:00Z').length, 0)
  const r = appt('2026-07-01T14:31:00Z')
  assert.equal(r.length, 1)
  assert.equal(r[0].title, 'Termin in 1 Stunde')
  assert.equal(r[0].body, 'Upper Body um 17:30 Uhr · Vorlage: Push-Tag')
  assert.equal(appt('2026-07-01T15:31:00Z').length, 0) // schon vorbei
})

test('Termin: verspäteter Lauf erinnert trotzdem, aber nur einmal', () => {
  assert.equal(appt('2026-07-01T15:10:00Z').length, 1)
  assert.equal(appt('2026-07-01T15:10:00Z', {}, base, [{ kind: 'appointment', ref: 'e1' }]).length, 0)
})

test('Termin: Erinnerung pro Termin, aus, Standard aus Einstellungen', () => {
  assert.equal(appt('2026-07-01T14:55:00Z', { erinnerung_min: 30 }).length, 0) // 30 Min vorher = ab 15:00 UTC
  assert.equal(appt('2026-07-01T15:05:00Z', { erinnerung_min: 30 })[0].title, 'Termin in 30 Minuten')
  assert.equal(appt('2026-07-01T14:35:00Z', { erinnerung_min: 0 }).length, 0)
  assert.equal(appt('2026-07-01T14:50:00Z', {}, { ...base, notif_appointment_minutes: 120 }).length, 1)
  assert.equal(appt('2026-06-30T15:31:00Z', { erinnerung_min: 1440 })[0].title, 'Termin morgen')
  assert.equal(appt('2026-07-01T14:35:00Z', {}, { ...base, notif_appointments: false }).length, 0)
  assert.equal(appt('2026-07-01T14:35:00Z', { uhrzeit: null }).length, 0)
})

test('Erinnerungstexte', () => {
  assert.equal(leadText(15), 'in 15 Minuten')
  assert.equal(leadText(60), 'in 1 Stunde')
  assert.equal(leadText(120), 'in 2 Stunden')
  assert.equal(leadText(1440), 'morgen')
})

test('Streak-Abfrage nur wenn nötig', () => {
  const at = iso('2026-07-01T10:00:00Z') // 12:00 Berlin
  assert.equal(needsStreak(at, base, empty, []), false) // noch nichts eingetragen, Abend noch weit
  assert.equal(needsStreak(at, base, { ...empty, weight: true }, []), true) // erster Eintrag heute
  assert.equal(needsStreak(at, base, { ...empty, weight: true }, [{ kind: 'streak-checked', ref: '2026-07-01' }]), false)
  assert.equal(needsStreak(iso('2026-07-01T18:05:00Z'), base, empty, []), true) // Abend-Erinnerung steht an
  assert.equal(needsStreak(iso('2026-07-01T18:05:00Z'), base, empty, [{ kind: 'missing', ref: '2026-07-01' }]), false)
  assert.equal(needsStreak(iso('2026-07-01T03:00:00Z'), base, { ...empty, weight: true }, []), false) // 05:00 Ruhezeit
})

test('Kontroll-Einträge zählen nicht gegen das Tageslimit', () => {
  const sent: SentRecord[] = [{ kind: 'streak-checked', ref: '2026-07-01' }, { kind: 'appointment', ref: 'e1' }, { kind: 'appointment', ref: 'e2' }]
  assert.deepEqual(run({ now: '2026-07-01T18:05:00Z', sent }).map(c => c.kind), ['missing'])
})
