// Datenbank-Tests: alle Migrationen laufen in einem echten Postgres (PGlite, im Speicher) und die Regeln des Spiels werden geprüft.
// Supabase-Teile (auth, storage, Rollen) sind in tests/supabase-stubs.sql nachgebaut. `npm test`
import test, { before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { dayAwards, challengeAward, streakAward, WELCOME_AWARD, type Award } from '../src/lib/game.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const SUPA = path.join(ROOT, 'supabase')
const read = (f: string) => fs.readFileSync(f, 'utf8')

const COACH = '22222222-2222-2222-2222-222222222222'
const A = '11111111-1111-1111-1111-111111111111' // Klient des Coaches
const B = '33333333-3333-3333-3333-333333333333' // anderer Klient, nicht beim Coach
const NEW_MIGRATIONS = ['20261009000001', '20261010000001', '20261011000001', '20261012000001']

let db: PGlite
let today = ''
let yesterday = ''

const migrationFiles = () => [
  path.join(SUPA, 'schema.sql'),
  ...['ernaehrung_mahlzeit', 'notification_settings', 'push_subscriptions', 'training_vorlagen', 'vorlagen_wochentage'].map(n => path.join(SUPA, 'archive', `${n}.sql`)),
  ...fs.readdirSync(path.join(SUPA, 'migrations')).sort().map(f => path.join(SUPA, 'migrations', f)),
]

/** Führt fn als angemeldeter Nutzer aus (Rolle authenticated, Zeilenrechte aktiv). */
async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role authenticated')
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
  try { return await fn() } finally { await db.exec('reset role') }
}
const q = (sql: string, params: unknown[] = []) => db.query(sql, params)
async function rejects(p: Promise<unknown>, re: RegExp) {
  await assert.rejects(p, (e: Error) => { assert.match(e.message, re); return true })
}
const award = (a: Award, uid = A) => q('insert into public.xp_events (user_id, quelle, ref, xp, punkte, titel) values ($1,$2,$3,$4,$5,$6)', [uid, a.quelle, a.ref, a.xp, a.punkte, a.titel])

before(async () => {
  db = new PGlite()
  await db.exec(read(path.join(ROOT, 'tests/supabase-stubs.sql')))
  for (const f of migrationFiles()) await db.exec(read(f))
  await db.exec(`grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to authenticated, service_role;
    grant all on all functions in schema public to authenticated, service_role;
    grant all on all tables in schema storage to authenticated, service_role;`)
  const d = (await q(`select current_date::text as t, (current_date - 1)::text as y`)).rows[0] as { t: string; y: string }
  today = d.t; yesterday = d.y
  await db.exec(`
    insert into auth.users (id, email) values ('${COACH}', 'coach@example.com'), ('${A}', 'a@example.com'), ('${B}', 'b@example.com') on conflict do nothing;
    insert into public.profiles (id, email, name, role, coach_id) values
      ('${COACH}', 'coach@example.com', 'Coach', 'coach', null),
      ('${A}', 'a@example.com', 'Anna', 'client', '${COACH}'),
      ('${B}', 'b@example.com', 'Ben', 'client', null)
    on conflict (id) do update set role = excluded.role, coach_id = excluded.coach_id, name = excluded.name;
    insert into public.client_settings (user_id, wasser_ziel_ml) values ('${A}', 2500) on conflict (user_id) do update set wasser_ziel_ml = 2500;
    insert into public.characters (user_id, name) values ('${A}', 'Hugo');
  `)
})

test('Migrationen: die vier neuen laufen auch ein zweites Mal ohne Fehler', async () => {
  const all = fs.readdirSync(path.join(SUPA, 'migrations')).sort().filter(f => NEW_MIGRATIONS.some(n => f.startsWith(n)))
  assert.equal(all.length, 4)
  for (const f of all) await db.exec(read(path.join(SUPA, 'migrations', f)))
})

test('Erfolge: was die App für echte Einträge berechnet, nimmt die Datenbank an', async () => {
  const sp = (await q(`insert into public.supplements (user_id, name, aktiv) values ($1,'D3',true) returning id`, [A])).rows[0] as { id: string }
  for (const m of ['Frühstück', 'Mittagessen', 'Abendessen']) await q(`insert into public.food_log (user_id, datum, mahlzeit, name) values ($1,$2,$3,'x')`, [A, today, m])
  await q(`insert into public.schlaf (user_id, datum) values ($1,$2)`, [A, today])
  await q(`insert into public.gewicht (user_id, datum, gewicht) values ($1,$2,80)`, [A, today])
  await q(`insert into public.training (user_id, datum, trainingstyp, einheit_id) values ($1,$2,'Kraft','e1'), ($1,$2,'Lauf','e2'), ($1,$2,'Yoga','e3')`, [A, today])
  await q(`insert into public.supplement_log (user_id, supplement_id, datum, eingenommen) values ($1,$2,$3,true)`, [A, sp.id, today])
  await q(`insert into public.wasser_log (user_id, datum, menge_ml) values ($1,$2,1500), ($1,$2,1200)`, [A, today])
  const list = dayAwards({
    date: today, mealsMain: ['Frühstück', 'Mittagessen', 'Abendessen'], sleep: true, weight: true, trainingIds: ['a', 'b', 'c'],
    supplementsTotal: 1, supplementsTaken: 1, waterMl: 2700, waterGoalMl: 2500,
  })
  assert.ok(list.length >= 9)
  await as(A, async () => { for (const a of [WELCOME_AWARD, ...list]) await award(a) })
  const stats = (await q(`select xp, punkte from public.character_stats where user_id = $1`, [A])).rows[0] as { xp: number; punkte: number }
  assert.equal(stats.xp, list.reduce((x, a) => x + a.xp, 0))
  assert.equal(stats.punkte, 50 + list.reduce((x, a) => x + a.punkte, 0))
})

test('Erfolge: erfundene oder falsch bemessene Einträge werden abgelehnt', async () => {
  const bad = (a: Award) => as(A, () => rejects(award(a), /Ungültig|Datum|Nicht genug/))
  // gestern gab es nichts
  await bad({ quelle: 'mahlzeit', ref: `${yesterday}:Frühstück`, xp: 6, punkte: 0, titel: 'x' })
  await bad({ quelle: 'schlaf', ref: yesterday, xp: 8, punkte: 0, titel: 'x' })
  // heute nur 3 Trainings: Nummer 3 zählt nie
  await bad({ quelle: 'training', ref: `${today}:3`, xp: 30, punkte: 10, titel: 'x' })
  // falsche Höhe
  await bad({ quelle: 'gewicht', ref: today + 'x', xp: 5, punkte: 0, titel: 'x' })
  await bad({ quelle: 'mahlzeit', ref: `${today}:Snack`, xp: 6, punkte: 0, titel: 'x' })
  // Wasserziel gestern nicht erreicht, Streak ohne Daten, unbekannte Quelle, Datum zu alt, selbst ausgedachte Punkte
  await bad({ quelle: 'wasser', ref: yesterday, xp: 20, punkte: 10, titel: 'x' })
  await bad({ quelle: 'streak', ref: `7@${yesterday}`, xp: 40, punkte: 25, titel: 'x' })
  await bad({ quelle: 'bonus', ref: 'x', xp: 500, punkte: 500, titel: 'x' })
  await bad({ quelle: 'schlaf', ref: '2020-01-01', xp: 8, punkte: 0, titel: 'x' })
  await bad({ ...WELCOME_AWARD, punkte: 500 })
  // XP bei Ausgaben, Ausgabe unter falscher Quelle
  await bad({ quelle: 'shop', ref: 'cap', xp: 10, punkte: -10, titel: 'x' })
  await bad({ quelle: 'bonus', ref: 'y', xp: 0, punkte: -10, titel: 'x' })
})

test('Erfolge: Serie wird gegen lückenlose Einträge geprüft', async () => {
  await q(`insert into public.gewicht (user_id, datum, gewicht) values ($1, current_date - 1, 80), ($1, current_date - 2, 80) on conflict do nothing`, [A])
  const start = (await q(`select (current_date - 2)::text as d`)).rows[0] as { d: string }
  const ok = streakAward(3, start.d)!
  await as(A, () => award(ok))
  // eine Serie mit Lücke: 7 Tage ab vor 6 Tagen
  const gap = (await q(`select (current_date - 6)::text as d`)).rows[0] as { d: string }
  await as(A, () => rejects(award(streakAward(7, gap.d)!), /Ungültig/))
})

test('Punkte ausgeben: nur mit Guthaben, auch bei mehreren Käufen hintereinander', async () => {
  const before = ((await q(`select punkte from public.character_stats where user_id = $1`, [A])).rows[0] as { punkte: number }).punkte
  await as(A, () => rejects(award({ quelle: 'shop', ref: 'goldchain', xp: 0, punkte: -(before + 1), titel: 'x' }), /Nicht genug Punkte/))
  await as(A, () => award({ quelle: 'shop', ref: 'cap', xp: 0, punkte: -40, titel: 'Kappe gekauft' }))
  const after = ((await q(`select punkte from public.character_stats where user_id = $1`, [A])).rows[0] as { punkte: number }).punkte
  assert.equal(after, before - 40)
  // dieselbe Sache nicht zweimal kaufen
  await as(A, () => rejects(award({ quelle: 'shop', ref: 'cap', xp: 0, punkte: -40, titel: 'x' }), /duplicate|unique/i))
})

test('Challenges: eigene höchstens 30 Punkte, Belohnung nur wie hinterlegt, Coach-Challenges sind geschützt', async () => {
  const own = await as(A, async () => (await q(`insert into public.challenges (user_id, vorlage_id, titel, punkte) values ($1,'frische-luft','Frische Luft',15) returning id`, [A])).rows[0] as { id: string })
  await as(A, () => rejects(q(`insert into public.challenges (user_id, titel, punkte) values ($1,'Geschummelt',100)`, [A]), /row-level security/))
  await as(A, () => rejects(q(`insert into public.challenges (user_id, coach_id, titel, punkte) values ($1,$2,'Von mir als Coach',50)`, [A, COACH]), /row-level security/))
  // Punkte nur in der hinterlegten Höhe
  await as(A, () => rejects(award({ ...challengeAward(own.id, 'x', 15), punkte: 40 }), /Ungültig/))
  await as(A, () => rejects(award({ ...challengeAward(own.id, 'x', 15), xp: 400 }), /Ungültig/))
  await as(A, () => award(challengeAward(own.id, 'Frische Luft', 15)))
  // Coach setzt eine Challenge, aber nur für eigene Klienten
  const mine = await as(COACH, async () => (await q(`insert into public.challenges (user_id, coach_id, titel, punkte) values ($1,$2,'Coach-Aufgabe',40) returning id`, [A, COACH])).rows[0] as { id: string })
  await as(COACH, () => rejects(q(`insert into public.challenges (user_id, coach_id, titel, punkte) values ($1,$2,'Fremd',40)`, [B, COACH]), /row-level security/))
  // Der Klient kann nur Status und Nachweis ändern, nicht Titel oder Punkte
  await as(A, () => q(`update public.challenges set titel = 'Neu', punkte = 100, status = 'erledigt', nachweis_text = 'Geschafft' where id = $1`, [mine.id]))
  const row = (await q(`select titel, punkte, status, nachweis_text from public.challenges where id = $1`, [mine.id])).rows[0] as Record<string, unknown>
  assert.deepEqual(row, { titel: 'Coach-Aufgabe', punkte: 40, status: 'erledigt', nachweis_text: 'Geschafft' })
  // Sichtbarkeit: der Coach sieht nur seine eigenen, B sieht nichts von A
  const seenByCoach = await as(COACH, async () => (await q(`select titel from public.challenges`)).rows.map(r => (r as { titel: string }).titel))
  assert.deepEqual(seenByCoach, ['Coach-Aufgabe'])
  assert.equal(await as(B, async () => (await q(`select * from public.challenges`)).rows.length), 0)
})

test('Datenschutz: Figur sichtbar für den Coach, Einzelheiten der Erfolge nicht; Fremde sehen nichts', async () => {
  assert.equal(await as(COACH, async () => (await q(`select * from public.characters`)).rows.length), 1)
  assert.equal(await as(COACH, async () => (await q(`select * from public.xp_events`)).rows.length), 0)
  assert.equal(await as(COACH, async () => (await q(`select * from public.character_stats where user_id = $1`, [A])).rows.length), 1)
  assert.equal(await as(B, async () => (await q(`select * from public.characters`)).rows.length), 0)
  assert.equal(await as(B, async () => (await q(`select * from public.character_stats`)).rows.length), 0)
  assert.equal(await as(B, async () => (await q(`select * from public.xp_events`)).rows.length), 0)
  // B kann für A weder eine Figur anlegen noch Erfolge eintragen
  await as(B, () => rejects(q(`insert into public.characters (user_id, name) values ($1,'Falsch')`, [A]), /row-level security/))
  await as(B, () => rejects(award(WELCOME_AWARD, A), /row-level security|Ungültig/))
})

test('Nachweis-Fotos: Klient nur im eigenen Ordner; Coach sieht nur Fotos seiner eigenen Challenges', async () => {
  const mine = (await q(`select id from public.challenges where coach_id = $1`, [COACH])).rows[0] as { id: string }
  const own = (await q(`select id from public.challenges where coach_id is null and user_id = $1`, [A])).rows[0] as { id: string }
  const coachPath = `${A}/coach-proof.jpg`, ownPath = `${A}/own-proof.jpg`
  await as(A, async () => {
    await q(`insert into storage.objects (bucket_id, name, owner) values ('challenge-proofs', $1, $2), ('challenge-proofs', $3, $2)`, [coachPath, A, ownPath])
    await rejects(q(`insert into storage.objects (bucket_id, name, owner) values ('challenge-proofs', $1, $2)`, [`${B}/fremd.jpg`, A]), /row-level security/)
    await q(`update public.challenges set nachweis_pfad = $1 where id = $2`, [coachPath, mine.id])
    await q(`update public.challenges set nachweis_pfad = $1 where id = $2`, [ownPath, own.id])
  })
  const seen = await as(COACH, async () => (await q(`select name from storage.objects where bucket_id = 'challenge-proofs'`)).rows.map(r => (r as { name: string }).name))
  assert.deepEqual(seen, [coachPath])
  assert.equal(await as(B, async () => (await q(`select name from storage.objects where bucket_id = 'challenge-proofs'`)).rows.length), 0)
})

test('Belohnungen und Gutscheine sind privat', async () => {
  await as(A, () => q(`insert into public.belohnungen (user_id, titel, preis) values ($1,'Kuchen',100)`, [A]))
  await as(A, () => q(`insert into public.einloesungen (user_id, titel, preis) values ($1,'Kuchen',100)`, [A]))
  for (const t of ['belohnungen', 'einloesungen']) {
    assert.equal(await as(COACH, async () => (await q(`select * from public.${t}`)).rows.length), 0, `${t}: Coach`)
    assert.equal(await as(B, async () => (await q(`select * from public.${t}`)).rows.length), 0, `${t}: anderer Klient`)
  }
})
