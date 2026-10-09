// Tests des Foto-Vergleichs: `npm test`
import test from 'node:test'
import assert from 'node:assert/strict'
import { compare, daysBetween, shiftISO, type BodyPhoto } from '../src/lib/photoCompare.ts'

const ph = (id: string, datum: string, label = 'Vorne'): BodyPhoto => ({ id, datum, label, path: id, url: id })
// absteigend sortiert wie in der App
const list = (...p: BodyPhoto[]) => [...p].sort((a, b) => b.datum.localeCompare(a.datum))

test('Datumsrechnung über Monats- und Sommerzeitgrenzen', () => {
  assert.equal(shiftISO('2026-03-01', -1), '2026-02-28')
  assert.equal(shiftISO('2026-10-26', -30), '2026-09-26')
  assert.equal(daysBetween('2026-10-26', '2026-10-25'), 1)
  assert.equal(daysBetween('2026-11-01', '2026-10-01'), 31)
})

test('Heute vs. 30 Tage: nimmt das Foto, das 30 Tage davor am nächsten liegt', () => {
  const photos = list(ph('a', '2026-10-09'), ph('b', '2026-09-10'), ph('c', '2026-09-01'), ph('d', '2026-07-01'))
  const r = compare(photos, 'Vorne', 30)!
  assert.equal(r.now.id, 'a')
  assert.equal(r.before?.id, 'b') // 29 Tage davor
  assert.equal(r.gapDays, 29)
  assert.equal(r.approximate, false)
})

test('Kein Foto genau dort: nächstes Foto, mit Hinweis wenn weit entfernt', () => {
  const photos = list(ph('a', '2026-10-09'), ph('d', '2026-07-01'))
  const r = compare(photos, 'Vorne', 30)!
  assert.equal(r.before?.id, 'd')
  assert.equal(r.approximate, true)
  assert.equal(r.gapDays, 100)
})

test('Nur ein Foto der Pose: noch nichts zu vergleichen', () => {
  const r = compare(list(ph('a', '2026-10-09')), 'Vorne', 30)!
  assert.equal(r.before, null)
})

test('Posen werden getrennt verglichen', () => {
  const photos = list(ph('a', '2026-10-09', 'Vorne'), ph('s', '2026-10-09', 'Seite'), ph('b', '2026-09-09', 'Seite'), ph('c', '2026-09-09', 'Vorne'))
  assert.equal(compare(photos, 'Seite', 30)!.before?.id, 'b')
  assert.equal(compare(photos, 'Vorne', 30)!.before?.id, 'c')
  assert.equal(compare(photos, 'Rücken', 30), null)
})

test('Start, 90 Tage und frei gewähltes Datum', () => {
  const photos = list(ph('a', '2026-10-09'), ph('b', '2026-09-09'), ph('c', '2026-07-12'), ph('d', '2026-05-01'))
  assert.equal(compare(photos, 'Vorne', 'start')!.before?.id, 'd')
  assert.equal(compare(photos, 'Vorne', 90)!.before?.id, 'c') // 89 Tage
  const r = compare(photos, 'Vorne', 'custom', '2026-05-10')!
  assert.equal(r.before?.id, 'd')
  assert.equal(r.wanted, 152)
})

test('Mehrere Fotos am selben Tag: Heute bleibt das neueste, Vorher liegt davor', () => {
  const photos = list(ph('a', '2026-10-09'), ph('a2', '2026-10-09'), ph('b', '2026-09-09'))
  const r = compare(photos, 'Vorne', 30)!
  assert.ok(['a', 'a2'].includes(r.now.id))
  assert.equal(r.before?.id, 'b')
})
