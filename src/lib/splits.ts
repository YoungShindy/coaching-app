// Split-Vorlagen für den Plan-Baukasten: Die Vorlage gibt Tage, Muskelgruppen und Rollen vor,
// die Übungen wählt man selbst aus dem Pool.
import type { GroupKey } from './exercises'

export type Role = 'grund' | 'iso'

export interface SlotDef { group: GroupKey; role: Role }
export interface DayDef { name: string; slots: SlotDef[] }
export interface SplitDef {
  id: string
  name: string
  tagline: string
  description: string
  days: DayDef[]
}

const g = (group: GroupKey): SlotDef => ({ group, role: 'grund' })
const i = (group: GroupKey): SlotDef => ({ group, role: 'iso' })

/** Sätze und Wiederholungen nach Prinzip: Grundübungen schwerer, Isolation höhere Wiederholungen. */
export function defaultsFor(role: Role, group: GroupKey): { sets: number; reps: string } {
  if (group === 'bauch' || group === 'waden' || group === 'unterarme') return { sets: 3, reps: '12-15' }
  if (role === 'grund') return { sets: 4, reps: '6-8' }
  return { sets: 3, reps: '10-15' }
}

export const ROLE_LABEL: Record<Role, string> = { grund: 'Grundübung', iso: 'Isolation' }

const fullBody = (name: string, push: GroupKey, pull: GroupKey): DayDef => ({
  name,
  slots: [g('quadrizeps'), g(push), g(pull), g('schultern'), i('beinbeuger'), i('bizeps'), i('trizeps'), i('bauch')],
})

const push: DayDef = {
  name: 'Push',
  slots: [g('brust'), g('brust'), g('schultern'), i('brust'), i('schultern'), i('trizeps'), i('trizeps')],
}
const pull: DayDef = {
  name: 'Pull',
  slots: [g('ruecken'), g('ruecken'), i('ruecken'), i('schultern'), i('trapez'), i('bizeps'), i('bizeps')],
}
const legs: DayDef = {
  name: 'Legs',
  slots: [g('quadrizeps'), g('quadrizeps'), g('beinbeuger'), g('gesaess'), i('beinbeuger'), i('waden'), i('bauch')],
}
const upper = (name: string): DayDef => ({
  name,
  slots: [g('brust'), g('ruecken'), g('schultern'), i('ruecken'), i('brust'), i('bizeps'), i('trizeps')],
})
const lower = (name: string): DayDef => ({
  name,
  slots: [g('quadrizeps'), g('beinbeuger'), g('gesaess'), i('quadrizeps'), i('waden'), i('bauch')],
})

export const SPLITS: SplitDef[] = [
  {
    id: 'ganzkoerper',
    name: 'Ganzkörper',
    tagline: '3 Tage · jeder Muskel mehrmals pro Woche',
    description: 'Ideal für den Einstieg und wenig Zeit: Pro Tag der ganze Körper, dazwischen Pausentage.',
    days: [fullBody('Ganzkörper A', 'brust', 'ruecken'), fullBody('Ganzkörper B', 'brust', 'ruecken'), fullBody('Ganzkörper C', 'brust', 'ruecken')],
  },
  {
    id: 'ober-unter',
    name: 'Ober- / Unterkörper',
    tagline: '4 Tage · Oberkörper und Beine im Wechsel',
    description: 'Jede Muskelgruppe zweimal pro Woche mit genug Erholung. Klassiker für Muskelaufbau.',
    days: [upper('Oberkörper A'), lower('Unterkörper A'), upper('Oberkörper B'), lower('Unterkörper B')],
  },
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    tagline: '3 Tage · Drücken, Ziehen, Beine',
    description: 'Der 3er-Split: Push (Brust, Schultern, Trizeps), Pull (Rücken, Bizeps), Legs (Beine, Bauch).',
    days: [push, pull, legs],
  },
  {
    id: 'ppl6',
    name: 'Push / Pull / Legs (6 Tage)',
    tagline: '6 Tage · jede Gruppe zweimal pro Woche',
    description: 'Der 3er-Split doppelt: Push, Pull, Legs, dann noch einmal mit anderen Übungen.',
    days: [
      { ...push, name: 'Push A' }, { ...pull, name: 'Pull A' }, { ...legs, name: 'Legs A' },
      { ...push, name: 'Push B' }, { ...pull, name: 'Pull B' }, { ...legs, name: 'Legs B' },
    ],
  },
  {
    id: 'torso-legs',
    name: 'Torso / Legs',
    tagline: '4 Tage · Oberkörper-Rumpf und Beine',
    description: 'Torso (Brust, Rücken, Schultern, Arme) und Legs im Wechsel, mit Bauch am Beintag.',
    days: [upper('Torso A'), { ...legs, name: 'Legs A' }, upper('Torso B'), { ...legs, name: 'Legs B' }],
  },
  {
    id: 'bro',
    name: 'Klassischer 5er-Split',
    tagline: '5 Tage · ein Muskel pro Tag',
    description: 'Brust, Rücken, Schultern, Arme und Beine: viel Umfang pro Muskelgruppe, einmal pro Woche.',
    days: [
      { name: 'Brust', slots: [g('brust'), g('brust'), g('brust'), i('brust'), i('brust'), i('bauch')] },
      { name: 'Rücken', slots: [g('ruecken'), g('ruecken'), g('ruecken'), i('ruecken'), i('trapez'), i('unterer_ruecken')] },
      { name: 'Schultern', slots: [g('schultern'), g('schultern'), i('schultern'), i('schultern'), i('trapez'), i('bauch')] },
      { name: 'Arme', slots: [g('trizeps'), g('bizeps'), i('trizeps'), i('bizeps'), i('trizeps'), i('bizeps'), i('unterarme')] },
      { name: 'Beine', slots: [g('quadrizeps'), g('quadrizeps'), g('beinbeuger'), g('gesaess'), i('beinbeuger'), i('waden'), i('waden')] },
    ],
  },
  {
    id: 'arnold',
    name: 'Arnold-Split',
    tagline: '3 Tage · Brust + Rücken, Schultern + Arme, Beine',
    description: 'Gegenspieler zusammen trainieren: Brust und Rücken, Schultern und Arme, dann Beine.',
    days: [
      { name: 'Brust & Rücken', slots: [g('brust'), g('ruecken'), g('brust'), g('ruecken'), i('brust'), i('ruecken'), i('bauch')] },
      { name: 'Schultern & Arme', slots: [g('schultern'), g('schultern'), i('schultern'), i('bizeps'), i('trizeps'), i('bizeps'), i('trizeps')] },
      { name: 'Beine', slots: [g('quadrizeps'), g('quadrizeps'), g('beinbeuger'), g('gesaess'), i('waden'), i('waden'), i('bauch')] },
    ],
  },
  {
    id: 'frei',
    name: 'Freier Split',
    tagline: 'Leer · Tage und Muskelgruppen selbst festlegen',
    description: 'Du startest mit einem leeren Tag und fügst Tage und Muskelgruppen nach Wunsch hinzu.',
    days: [{ name: 'Tag 1', slots: [] }],
  },
]

/** Vorschlag für Wochentage (1 = Montag … 7 = Sonntag) je nach Anzahl der Trainingstage. */
export function suggestWeekdays(count: number): number[] {
  const map: Record<number, number[]> = {
    1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7],
  }
  return map[Math.min(Math.max(count, 1), 7)]
}
