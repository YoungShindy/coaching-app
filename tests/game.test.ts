// Tests der Spielregeln: `npm test`
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  levelInfo, xpForLevel, xpToNext, levelTitle, dayAwards, isGreenDay, streakAward, challengeAward, itemState, toggleEquip,
  SHOP, CHALLENGES, CHALLENGE_CATEGORIES, weekKey, dailySuggestions, cleanName, itemById,
  type DayAwardFacts,
} from '../src/lib/game.ts'

const base: DayAwardFacts = { date: '2026-10-09', mealsMain: [], sleep: false, weight: false, trainingIds: [], supplementsTotal: 0, supplementsTaken: 0, waterMl: 0, waterGoalMl: 2500 }

test('Level: Schwellen und Fortschritt', () => {
  assert.equal(xpForLevel(1), 0)
  assert.equal(xpForLevel(2), 100)
  assert.equal(xpForLevel(3), 225)
  assert.equal(xpToNext(1), 100)
  assert.equal(xpToNext(2), 125)
  assert.deepEqual(levelInfo(0), { level: 1, xpInto: 0, xpNeed: 100, pct: 0, next: 2 })
  assert.equal(levelInfo(99).level, 1)
  assert.equal(levelInfo(99).pct, 99)
  assert.equal(levelInfo(100).level, 2)
  assert.equal(levelInfo(224).level, 2)
  assert.equal(levelInfo(225).level, 3)
  assert.equal(levelInfo(-5).level, 1)
})

test('Level: wächst gleichmäßig und ohne Lücken', () => {
  let last = 0
  for (let lvl = 1; lvl <= 40; lvl++) {
    const need = xpForLevel(lvl)
    assert.ok(need >= last)
    assert.equal(levelInfo(need).level, lvl)
    assert.equal(levelInfo(need + xpToNext(lvl) - 1).level, lvl)
    last = need
  }
})

test('Titel steigen mit dem Level', () => {
  assert.equal(levelTitle(1), 'Starter')
  assert.equal(levelTitle(5), 'Aktivposten')
  assert.equal(levelTitle(25), 'Legende')
})

test('Tageserfolge: nichts eingetragen, nichts vergeben', () => {
  assert.deepEqual(dayAwards(base), [])
})

test('Tageserfolge: grüner Tag mit allem', () => {
  const f: DayAwardFacts = { ...base, mealsMain: ['Frühstück', 'Mittagessen', 'Abendessen'], sleep: true, weight: true, trainingIds: ['t1'], supplementsTotal: 2, supplementsTaken: 2, waterMl: 2600 }
  const a = dayAwards(f)
  assert.ok(isGreenDay(f))
  assert.ok(a.some(x => x.quelle === 'gruener-tag'))
  assert.ok(a.some(x => x.quelle === 'wasser'))
  assert.equal(new Set(a.map(x => `${x.quelle}|${x.ref}`)).size, a.length) // jede Referenz nur einmal
  assert.equal(a.reduce((s, x) => s + x.xp, 0), 6 * 3 + 8 + 5 + 30 + 8 + 20 + 30)
  assert.equal(a.reduce((s, x) => s + x.punkte, 0), 10 + 10 + 20)
})

test('Grüner Tag: ohne Supplements zählt er trotzdem, mit offenen nicht', () => {
  const meals = ['Frühstück', 'Mittagessen', 'Abendessen']
  assert.ok(isGreenDay({ ...base, mealsMain: meals, sleep: true }))
  assert.ok(!isGreenDay({ ...base, mealsMain: meals, sleep: true, supplementsTotal: 2, supplementsTaken: 1 }))
  assert.ok(!isGreenDay({ ...base, mealsMain: meals.slice(0, 2), sleep: true }))
  assert.ok(!isGreenDay({ ...base, mealsMain: meals, sleep: false }))
})

test('Tageserfolge: höchstens zwei Einheiten, Wasserziel nur bei Erreichen', () => {
  const a = dayAwards({ ...base, trainingIds: ['a', 'b', 'c'], waterMl: 2000 })
  assert.equal(a.filter(x => x.quelle === 'training').length, 2)
  assert.equal(a.filter(x => x.quelle === 'wasser').length, 0)
  assert.equal(dayAwards({ ...base, waterMl: 2500 }).filter(x => x.quelle === 'wasser').length, 1)
  assert.equal(dayAwards({ ...base, waterMl: 5000, waterGoalMl: 0 }).filter(x => x.quelle === 'wasser').length, 0)
})

test('Training: gleiche Referenz pro Tag, egal welche Zeilen es gibt (Löschen und Neu-Eintragen bringt nichts)', () => {
  const refs = (ids: string[]) => dayAwards({ ...base, trainingIds: ids }).filter(x => x.quelle === 'training').map(x => x.ref)
  assert.deepEqual(refs(['a']), ['2026-10-09:1'])
  assert.deepEqual(refs(['x', 'y', 'z']), ['2026-10-09:1', '2026-10-09:2'])
  assert.deepEqual(refs(['a']), refs(['b']))
})

test('Serien-Belohnung nur an Meilensteinen', () => {
  assert.equal(streakAward(4, '2026-10-01'), null)
  const s = streakAward(7, '2026-10-03')!
  assert.equal(s.ref, '7@2026-10-03')
  assert.equal(s.punkte, 25)
})

test('Challenge-Belohnung', () => {
  const a = challengeAward('abc', 'Frische Luft', 20)
  assert.deepEqual([a.xp, a.punkte, a.quelle], [30, 20, 'challenge'])
})

test('Shop: Status, Kauf und Anziehen', () => {
  const owned = new Set(['cap'])
  const cap = itemById('cap')!, hoodie = itemById('hoodie')!, crown = itemById('crown')!, dog = itemById('dog')!
  assert.equal(itemState(cap, owned, 1, 0), 'owned')
  assert.equal(itemState(hoodie, owned, 2, 60), 'buyable')
  assert.equal(itemState(hoodie, owned, 2, 59), 'poor')
  assert.equal(itemState(hoodie, owned, 1, 999), 'locked')
  assert.equal(itemState(crown, owned, 14, 999), 'locked')
  assert.equal(itemState(dog, owned, 4, 180), 'buyable')
  let eq = toggleEquip({}, cap)
  assert.deepEqual(eq, { kopf: 'cap' })
  eq = toggleEquip(eq, itemById('beanie')!)
  assert.deepEqual(eq, { kopf: 'beanie' }) // gleicher Platz wird ersetzt
  eq = toggleEquip(eq, itemById('beanie')!)
  assert.deepEqual(eq, {}) // erneut tippen zieht aus
})

test('Shop: eindeutige Kennungen, Preise und vier Bereiche', () => {
  assert.equal(new Set(SHOP.map(i => i.id)).size, SHOP.length)
  assert.deepEqual([...new Set(SHOP.map(i => i.kategorie))].sort(), ['kleidung', 'kopf', 'schmuck', 'tiere'])
  assert.ok(SHOP.every(i => i.preis > 0 && i.minLevel >= 1))
})

test('Challenges: genug, eindeutig, sinnvolle Punkte, alle Bereiche', () => {
  assert.ok(CHALLENGES.length >= 60)
  assert.equal(new Set(CHALLENGES.map(c => c.id)).size, CHALLENGES.length)
  assert.ok(CHALLENGES.every(c => c.punkte >= 5 && c.punkte <= 100 && c.titel && c.text.endsWith('.')))
  for (const cat of CHALLENGE_CATEGORIES) assert.ok(CHALLENGES.filter(c => c.kategorie === cat.key).length >= 6, cat.key)
})

test('Kalenderwoche nach ISO', () => {
  assert.equal(weekKey('2026-10-09'), '2026-W41')
  assert.equal(weekKey('2026-10-05'), '2026-W41')
  assert.equal(weekKey('2026-10-11'), '2026-W41')
  assert.equal(weekKey('2026-10-12'), '2026-W42')
  assert.equal(weekKey('2025-12-29'), '2026-W01')
  assert.equal(weekKey('2027-01-01'), '2026-W53')
})

test('Tagesvorschläge: drei aus verschiedenen Bereichen, täglich anders, erledigte fehlen', () => {
  const a = dailySuggestions('2026-10-09', new Set())
  assert.equal(a.length, 3)
  assert.equal(new Set(a.map(x => x.kategorie)).size, 3)
  assert.deepEqual(dailySuggestions('2026-10-09', new Set()).map(x => x.id), a.map(x => x.id)) // stabil am selben Tag
  const other = dailySuggestions('2026-10-10', new Set())
  assert.notDeepEqual(other.map(x => x.id), a.map(x => x.id))
  const done = new Set(a.map(x => x.id))
  const again = dailySuggestions('2026-10-09', done)
  assert.ok(again.every(x => !done.has(x.id)))
})

test('Name: gekürzt und bereinigt', () => {
  assert.equal(cleanName('  Max   Power  '), 'Max Power')
  assert.equal(cleanName('ABCDEFGHIJKLMNOPQRSTUV').length, 16)
})
