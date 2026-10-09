// Aussehen der Figur. Der Editor, Shop und Level-Belohnungen (Paket 4) bauen darauf auf.

export type FaceShape = 'round' | 'oval' | 'square'
export type HairStyle = 'short' | 'buzz' | 'side' | 'curly' | 'long' | 'ponytail' | 'bun' | 'bald'
export type EyeStyle = 'round' | 'happy' | 'wide' | 'calm'
export type BrowStyle = 'soft' | 'strong' | 'thin'
export type MouthStyle = 'smile' | 'grin' | 'soft' | 'open'
export type BeardStyle = 'none' | 'stubble' | 'mustache' | 'short' | 'full'

export interface AvatarConfig {
  skin: string
  face: FaceShape
  hairStyle: HairStyle
  hairColor: string
  eyes: EyeStyle
  brows: BrowStyle
  mouth: MouthStyle
  beard: BeardStyle
  shirt: string
}

export const SKIN_TONES = ['#FAD9C1', '#F2C29B', '#E0A370', '#C68642', '#8D5524', '#5C3A21']
export const HAIR_COLORS = ['#1D1B1A', '#3B2A20', '#6B4423', '#9A4A22', '#D9B25F', '#A3A3A3', '#C4461F', '#EDEDED']
export const SHIRT_COLORS = ['#075640', '#2A80D6', '#C4461F', '#6B4FC8', '#1D1B1A', '#E0A526']

export const FACE_SHAPES: { key: FaceShape; label: string }[] = [
  { key: 'round', label: 'Rund' }, { key: 'oval', label: 'Oval' }, { key: 'square', label: 'Eckig' },
]
export const HAIR_STYLES: { key: HairStyle; label: string }[] = [
  { key: 'short', label: 'Kurz' }, { key: 'buzz', label: 'Millimeter' }, { key: 'side', label: 'Seitenscheitel' },
  { key: 'curly', label: 'Locken' }, { key: 'long', label: 'Lang' }, { key: 'ponytail', label: 'Zopf' },
  { key: 'bun', label: 'Dutt' }, { key: 'bald', label: 'Glatze' },
]
export const EYE_STYLES: { key: EyeStyle; label: string }[] = [
  { key: 'round', label: 'Rund' }, { key: 'happy', label: 'Fröhlich' }, { key: 'wide', label: 'Wach' }, { key: 'calm', label: 'Ruhig' },
]
export const BROW_STYLES: { key: BrowStyle; label: string }[] = [
  { key: 'soft', label: 'Weich' }, { key: 'strong', label: 'Kräftig' }, { key: 'thin', label: 'Fein' },
]
export const MOUTH_STYLES: { key: MouthStyle; label: string }[] = [
  { key: 'smile', label: 'Lächeln' }, { key: 'grin', label: 'Grinsen' }, { key: 'soft', label: 'Sanft' }, { key: 'open', label: 'Offen' },
]
export const BEARD_STYLES: { key: BeardStyle; label: string }[] = [
  { key: 'none', label: 'Kein Bart' }, { key: 'stubble', label: 'Dreitagebart' }, { key: 'mustache', label: 'Schnurrbart' },
  { key: 'short', label: 'Kurzbart' }, { key: 'full', label: 'Vollbart' },
]

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: SKIN_TONES[1], face: 'round', hairStyle: 'short', hairColor: HAIR_COLORS[1],
  eyes: 'round', brows: 'soft', mouth: 'smile', beard: 'none', shirt: SHIRT_COLORS[0],
}

/** Dunklere Variante einer Farbe (für Hals, Schatten, Nase). */
export function shade(hex: string, amount = 0.14): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)))
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

export const RANDOM_NAMES = ['Hugo', 'Pia', 'Max', 'Luna', 'Finn', 'Mila', 'Leo', 'Nova', 'Rocky', 'Sunny', 'Emil', 'Ida', 'Bruno', 'Zoe', 'Jonas', 'Lotta']

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]

/** Zufällige Figur für den Würfel-Knopf im Editor. */
export function randomConfig(): AvatarConfig {
  return {
    skin: pick(SKIN_TONES), face: pick(FACE_SHAPES).key, hairStyle: pick(HAIR_STYLES).key, hairColor: pick(HAIR_COLORS),
    eyes: pick(EYE_STYLES).key, brows: pick(BROW_STYLES).key, mouth: pick(MOUTH_STYLES).key,
    beard: Math.random() < 0.7 ? 'none' : pick(BEARD_STYLES).key, shirt: pick(SHIRT_COLORS),
  }
}
