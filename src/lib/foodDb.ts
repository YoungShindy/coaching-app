// Lebensmittel-Suche: eingebaute Liste häufiger Lebensmittel (mit Größen, Reifegraden und Einheiten),
// Produkte aus Open Food Facts und Ergebnisse aus dem Internet (Edge Function „food-search“).

import { supabase } from './supabase'

// ─── Typen ────────────────────────────────────────────────────────────────────────────────────────

export interface Per100 {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** Eine Einheit neben Gramm, z. B. „Stück“ (120 g) oder „Keks“ (11 g). */
export interface FoodUnit {
  label: string
  grams: number
}

/** Eine Auswahl innerhalb einer Gruppe, z. B. „groß“ (Größe) oder „sehr reif“ (Reife). */
export interface VariantChoice {
  label: string
  /** Gewicht der ersten Einheit (Stück) bei dieser Auswahl */
  grams?: number
  /** Abweichende Nährwerte pro 100 g bei dieser Auswahl */
  per100?: Partial<Per100>
}

export interface VariantGroup {
  name: string
  choices: VariantChoice[]
  defaultIndex?: number
}

export interface FoodEntry {
  id: string
  name: string
  brand?: string
  source: 'local' | 'web' | 'off'
  per100: Per100
  units: FoodUnit[]
  groups?: VariantGroup[]
  barcode?: string
  /** true, wenn noch keine Stück-/Portionsangabe bekannt ist (Einheiten können nachgeladen werden) */
  needsUnits?: boolean
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────────────────────

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function formatAmount(n: number): string {
  return String(round1(n)).replace('.', ',')
}

// ─── Eingebaute Liste ────────────────────────────────────────────────────────────────────────────────
// Durchschnittswerte pro 100 g (essbarer Anteil) nach üblichen Nährwerttabellen; Gewichte der Stücke gerundet.

type Spec = {
  name: string
  alias?: string
  n: [number, number, number, number] // kcal, Protein, Kohlenhydrate, Fett
  units?: [string, number][]
  groups?: VariantGroup[]
}

const SIZE_FRUIT = (small: number, medium: number, large: number): VariantGroup => ({
  name: 'Größe',
  defaultIndex: 1,
  choices: [
    { label: 'klein', grams: small },
    { label: 'mittel', grams: medium },
    { label: 'groß', grams: large },
  ],
})

const SPECS: Spec[] = [
  // Obst
  {
    name: 'Banane', alias: 'bananen', n: [95, 1.2, 20.5, 0.2], units: [['Stück', 120]],
    groups: [
      SIZE_FRUIT(90, 120, 150),
      {
        name: 'Reife', defaultIndex: 1,
        choices: [
          { label: 'grün', per100: { kcal: 88, protein: 1.1, carbs: 19.5, fat: 0.3 } },
          { label: 'reif', per100: { kcal: 95, protein: 1.2, carbs: 20.5, fat: 0.2 } },
          { label: 'sehr reif', per100: { kcal: 100, protein: 1.2, carbs: 22.5, fat: 0.2 } },
        ],
      },
    ],
  },
  { name: 'Apfel', alias: 'aepfel', n: [54, 0.3, 11.4, 0.4], units: [['Stück', 160]], groups: [SIZE_FRUIT(110, 160, 210)] },
  { name: 'Birne', alias: 'birnen', n: [56, 0.5, 12.4, 0.3], units: [['Stück', 170]], groups: [SIZE_FRUIT(130, 170, 220)] },
  { name: 'Orange', alias: 'orangen apfelsine', n: [47, 1.0, 8.3, 0.2], units: [['Stück', 150]], groups: [SIZE_FRUIT(110, 150, 200)] },
  { name: 'Mandarine / Clementine', alias: 'mandarinen clementine clementinen', n: [46, 0.7, 10.0, 0.2], units: [['Stück', 60]], groups: [SIZE_FRUIT(45, 60, 80)] },
  { name: 'Erdbeeren', alias: 'erdbeere', n: [32, 0.7, 5.5, 0.4], units: [['Beere', 15], ['Handvoll', 100], ['Schale', 250]] },
  { name: 'Himbeeren', alias: 'himbeere', n: [36, 1.3, 4.8, 0.3], units: [['Beere', 3], ['Handvoll', 50], ['Schale', 125]] },
  { name: 'Blaubeeren', alias: 'heidelbeeren blaubeere', n: [42, 0.7, 9.0, 0.6], units: [['Beere', 1.5], ['Handvoll', 50], ['Schale', 125]] },
  { name: 'Weintrauben', alias: 'trauben traube', n: [70, 0.7, 15.2, 0.2], units: [['Beere', 5], ['Handvoll', 80], ['Traube', 150]] },
  { name: 'Wassermelone', alias: 'melone', n: [37, 0.6, 8.3, 0.2], units: [['Scheibe', 300]] },
  { name: 'Ananas', n: [55, 0.5, 12.4, 0.2], units: [['Scheibe', 80]] },
  { name: 'Kiwi', n: [51, 1.0, 10.3, 0.6], units: [['Stück', 70]], groups: [SIZE_FRUIT(55, 70, 90)] },
  { name: 'Mango', n: [62, 0.5, 14.0, 0.3], units: [['Stück', 250]] },
  { name: 'Avocado', n: [160, 2.0, 8.5, 14.7], units: [['Hälfte', 100], ['Stück', 200]] },
  // Gemüse & Beilagen
  { name: 'Tomate', alias: 'tomaten', n: [18, 0.9, 2.6, 0.2], units: [['Stück', 100]], groups: [SIZE_FRUIT(60, 100, 150)] },
  { name: 'Gurke', alias: 'salatgurke', n: [12, 0.6, 1.8, 0.2], units: [['Scheibe', 5], ['Stück', 400]] },
  { name: 'Paprika', n: [28, 1.2, 5.0, 0.3], units: [['Stück', 150]] },
  { name: 'Karotte / Möhre', alias: 'karotten moehre moehren', n: [27, 0.9, 4.8, 0.2], units: [['Stück', 80]] },
  { name: 'Brokkoli', alias: 'broccoli', n: [34, 3.0, 4.0, 0.4], units: [['Röschen', 30], ['Kopf', 400]] },
  { name: 'Kartoffeln (gekocht)', alias: 'kartoffel pellkartoffeln', n: [71, 2.0, 14.8, 0.1], units: [['Stück', 80]], groups: [SIZE_FRUIT(50, 80, 120)] },
  { name: 'Süßkartoffel (gebacken)', alias: 'suesskartoffel suesskartoffeln', n: [90, 2.0, 20.7, 0.2], units: [['Stück', 200]] },
  { name: 'Reis (gekocht)', alias: 'reis basmati jasmin', n: [130, 2.7, 28.0, 0.3], units: [['Portion', 180], ['Tasse', 160]] },
  { name: 'Reis (roh)', n: [350, 7.0, 77.0, 0.6], units: [['Portion', 70], ['Tasse', 185]] },
  { name: 'Nudeln (gekocht)', alias: 'pasta spaghetti penne', n: [150, 5.5, 29.5, 0.9], units: [['Portion', 250]] },
  { name: 'Nudeln (roh)', alias: 'pasta spaghetti penne', n: [360, 13.0, 71.0, 1.5], units: [['Portion', 100]] },
  { name: 'Haferflocken', alias: 'hafer oats porridge', n: [372, 13.5, 58.7, 7.0], units: [['Esslöffel', 10], ['Handvoll', 40], ['Portion', 50]] },
  { name: 'Cornflakes', alias: 'cerealien', n: [375, 7.5, 84.0, 0.9], units: [['Portion', 30]] },
  { name: 'Vollkornbrot', alias: 'brot schwarzbrot', n: [200, 6.5, 38.0, 1.5], units: [['Scheibe', 50]], groups: [{ name: 'Dicke', defaultIndex: 1, choices: [{ label: 'dünn', grams: 35 }, { label: 'normal', grams: 50 }, { label: 'dick', grams: 70 }] }] },
  { name: 'Toastbrot', alias: 'toast weissbrot', n: [265, 7.5, 49.0, 3.5], units: [['Scheibe', 25]] },
  { name: 'Brötchen', alias: 'broetchen semmel weckle', n: [270, 8.5, 55.0, 1.0], units: [['Stück', 55]], groups: [SIZE_FRUIT(40, 55, 70)] },
  { name: 'Reiswaffeln', alias: 'reiswaffel puffreis', n: [380, 8.0, 80.0, 2.5], units: [['Stück', 9]] },
  // Milch, Eier, Käse
  {
    name: 'Ei (Hühnerei)', alias: 'eier hühnerei huehnerei spiegelei rührei ruehrei', n: [143, 12.6, 0.7, 9.9], units: [['Stück', 53]],
    groups: [{ name: 'Größe', defaultIndex: 1, choices: [{ label: 'S', grams: 45 }, { label: 'M', grams: 53 }, { label: 'L', grams: 60 }, { label: 'XL', grams: 68 }] }],
  },
  { name: 'Magerquark', alias: 'quark', n: [67, 12.0, 4.0, 0.3], units: [['Esslöffel', 30], ['Becher', 250]] },
  { name: 'Skyr (natur)', alias: 'skyr', n: [63, 11.0, 4.0, 0.2], units: [['Becher', 150], ['Packung', 450]] },
  { name: 'Naturjoghurt (3,5 %)', alias: 'joghurt jogurt', n: [66, 3.5, 4.7, 3.8], units: [['Becher', 150], ['Esslöffel', 20]] },
  { name: 'Hüttenkäse', alias: 'huettenkaese cottage cheese', n: [98, 12.5, 2.7, 4.3], units: [['Becher', 200]] },
  { name: 'Milch (1,5 %)', n: [47, 3.4, 4.8, 1.5], units: [['Glas', 200], ['Tasse', 150]] },
  { name: 'Milch (3,5 %)', n: [65, 3.3, 4.8, 3.5], units: [['Glas', 200], ['Tasse', 150]] },
  { name: 'Gouda', alias: 'kaese käse emmentaler', n: [360, 24.9, 0.1, 29.0], units: [['Scheibe', 25]] },
  { name: 'Mozzarella', n: [250, 18.0, 1.0, 19.0], units: [['Kugel', 125]] },
  { name: 'Butter', n: [741, 0.7, 0.6, 83.0], units: [['Teelöffel', 5], ['Esslöffel', 10], ['Portion', 10]] },
  // Fleisch, Fisch
  { name: 'Hähnchenbrust (roh)', alias: 'haehnchenbrust huhn hühnchen chicken haehnchen', n: [106, 23.0, 0.0, 1.5], units: [['Filet', 150]] },
  { name: 'Hähnchenbrust (gegart)', alias: 'haehnchenbrust huhn hühnchen chicken haehnchen gebraten', n: [165, 31.0, 0.0, 3.6], units: [['Filet', 120]] },
  { name: 'Rinderhack (10 % Fett)', alias: 'hackfleisch hack rind', n: [176, 20.0, 0.0, 10.0], units: [['Portion', 150]] },
  { name: 'Lachs (roh)', alias: 'lachsfilet', n: [202, 20.0, 0.0, 13.0], units: [['Filet', 150]] },
  { name: 'Thunfisch (Dose, im eigenen Saft)', alias: 'thunfisch', n: [116, 26.0, 0.0, 1.0], units: [['Dose (abgetropft)', 112]] },
  { name: 'Kochschinken', alias: 'schinken', n: [107, 20.0, 0.5, 2.5], units: [['Scheibe', 20]] },
  { name: 'Tofu (natur)', n: [120, 13.0, 1.0, 7.0], units: [['Packung', 200]] },
  // Nüsse, Süßes, Öle
  { name: 'Mandeln', alias: 'mandel', n: [580, 21.0, 9.0, 51.0], units: [['Stück', 1.2], ['Handvoll', 30]] },
  { name: 'Walnüsse', alias: 'walnuesse walnuss nuesse nüsse', n: [654, 15.0, 7.0, 65.0], units: [['Nuss', 4], ['Handvoll', 30]] },
  { name: 'Erdnussbutter', alias: 'peanutbutter peanut butter', n: [588, 25.0, 20.0, 50.0], units: [['Teelöffel', 8], ['Esslöffel', 16]] },
  { name: 'Honig', n: [306, 0.4, 75.0, 0.0], units: [['Teelöffel', 10], ['Esslöffel', 20]] },
  { name: 'Zucker', n: [400, 0.0, 100.0, 0.0], units: [['Teelöffel', 5], ['Esslöffel', 12]] },
  { name: 'Vollmilchschokolade', alias: 'schokolade', n: [535, 7.5, 57.0, 30.0], units: [['Rippe', 5], ['Tafel', 100]] },
  { name: 'Olivenöl', alias: 'olivenoel oel öl', n: [884, 0.0, 0.0, 100.0], units: [['Teelöffel', 5], ['Esslöffel', 10]] },
  { name: 'Kartoffelchips', alias: 'chips', n: [530, 6.0, 50.0, 33.0], units: [['Handvoll', 30], ['Tüte', 150]] },
  { name: 'Gummibärchen', alias: 'gummibaerchen haribo goldbaeren', n: [343, 6.9, 77.0, 0.5], units: [['Stück', 2.5], ['Handvoll', 30], ['Tüte', 200]] },
  { name: 'Whey Protein (Pulver)', alias: 'proteinpulver protein shake eiweisspulver', n: [380, 78.0, 6.0, 6.0], units: [['Scoop', 30]] },
  // Getränke
  { name: 'Cola', alias: 'cola coca', n: [42, 0.0, 10.6, 0.0], units: [['Glas', 250], ['Dose', 330]] },
  { name: 'Orangensaft', alias: 'saft', n: [45, 0.7, 9.6, 0.2], units: [['Glas', 200]] },
  { name: 'Bier', n: [43, 0.4, 3.1, 0.0], units: [['Glas', 330], ['Halbe', 500]] },
]

const LOCAL_FOODS: { entry: FoodEntry; search: string }[] = SPECS.map((spec, index) => ({
  entry: {
    id: `local-${index}`,
    name: spec.name,
    source: 'local',
    per100: { kcal: spec.n[0], protein: spec.n[1], carbs: spec.n[2], fat: spec.n[3] },
    units: (spec.units ?? []).map(([label, grams]) => ({ label, grams })),
    groups: spec.groups,
  },
  search: normalize(`${spec.name} ${spec.alias ?? ''}`),
}))

export const POPULAR_SEARCHES = ['Banane', 'Haferflocken', 'Ei', 'Skyr', 'Reis', 'Hähnchenbrust', 'Vollkornbrot', 'Apfel']

/** Sucht in der eingebauten Liste (sofort, ohne Internet). */
export function searchLocalFoods(query: string, limit = 8): FoodEntry[] {
  const q = normalize(query)
  if (q.length < 2) return []
  const words = q.split(' ')
  const scored: { entry: FoodEntry; score: number }[] = []
  for (const { entry, search } of LOCAL_FOODS) {
    const name = normalize(entry.name)
    let score = -1
    if (name === q) score = 100
    else if (name.startsWith(q)) score = 80
    else if (search.split(' ').some(word => word.startsWith(q))) score = 60
    else if (words.every(word => search.includes(word))) score = 40
    if (score >= 0) scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length)
  return scored.slice(0, limit).map(({ entry }) => entry)
}

// ─── Open Food Facts ───────────────────────────────────────────────────────────────────────────

export interface OFFNutriments {
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
}

export interface OFFProduct {
  code?: string
  product_name?: string
  product_name_de?: string
  brands?: string
  nutriments?: OFFNutriments
  serving_quantity?: number | string
  serving_size?: string
  product_quantity?: number | string
  quantity?: string
}

export const OFF_FIELDS = 'code,product_name,product_name_de,brands,nutriments,serving_quantity,serving_size,product_quantity,quantity'

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function singular(label: string): string {
  const word = label.trim()
  if (/[a-zäöü]{3,}se$/i.test(word)) return word.slice(0, -1) // Kekse → Keks
  if (/[a-zäöü]{3,}en$/i.test(word) && !/(riegen|tropfen|kuchen|brötchen|plätzchen)$/i.test(word)) return word.slice(0, -1) // Scheiben → Scheibe
  return word
}

/** Aus „1 Keks (11 g)“, „2 Kekse (22 g)“ oder „30 g“ eine Einheit machen. */
export function parseServing(text: string | undefined, servingGrams: number): FoodUnit | null {
  const raw = (text ?? '').trim()
  if (raw) {
    const match = raw.match(/^(\d+(?:[.,]\d+)?)\s*([^\d(),]*?)\s*(?:\(\s*(\d+(?:[.,]\d+)?)\s*(?:g|ml)\s*\))?$/i)
    if (match) {
      const count = num(match[1]) || 1
      const label = match[2].trim()
      const inner = num(match[3])
      const isPlainUnit = /^(g|gramm|ml|milliliter)$/i.test(label)
      if (label && !isPlainUnit && count > 0) {
        const grams = inner > 0 ? inner / count : servingGrams > 0 && count === 1 ? servingGrams : 0
        if (grams > 0) return { label: singular(label.charAt(0).toUpperCase() + label.slice(1)), grams: round1(grams) }
      }
    }
  }
  return servingGrams > 0 ? { label: 'Portion', grams: round1(servingGrams) } : null
}

export function entryFromOff(product: OFFProduct, code?: string): FoodEntry | null {
  const name = product.product_name_de || product.product_name
  const n = product.nutriments ?? {}
  const kcal = num(n['energy-kcal_100g'])
  if (!name || kcal <= 0) return null
  const units: FoodUnit[] = []
  const serving = parseServing(product.serving_size, num(product.serving_quantity))
  if (serving) units.push(serving)
  const pack = num(product.product_quantity)
  if (pack > 0 && !units.some(unit => Math.abs(unit.grams - pack) < 0.5)) units.push({ label: 'Packung', grams: round1(pack) })
  const barcode = code ?? product.code
  return {
    id: `off-${barcode ?? normalize(name)}`,
    name,
    brand: product.brands?.split(',')[0]?.trim() || undefined,
    source: 'off',
    per100: { kcal, protein: num(n.proteins_100g), carbs: num(n.carbohydrates_100g), fat: num(n.fat_100g) },
    units,
    barcode,
    needsUnits: !serving || serving.label === 'Portion',
  }
}

export async function searchOpenFoodFacts(term: string, signal?: AbortSignal): Promise<FoodEntry[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&json=1&page_size=24&fields=${OFF_FIELDS}&lc=de&cc=de`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('off')
  const data = await res.json()
  const seen = new Set<string>()
  const result: FoodEntry[] = []
  for (const product of (data.products ?? []) as OFFProduct[]) {
    const entry = entryFromOff(product)
    if (!entry) continue
    const key = normalize(`${entry.name} ${entry.brand ?? ''}`)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(entry)
    if (result.length >= 15) break
  }
  return result
}

export async function lookupBarcodeEntry(code: string): Promise<FoodEntry | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`)
  const data = await res.json()
  if (data.status !== 1 || !data.product) return null
  return entryFromOff(data.product as OFFProduct, code)
}

// ─── Internet-Suche (Edge Function) ─────────────────────────────────────────────────────────────────

const webCache = new Map<string, Promise<FoodEntry[]>>()
const unitCache = new Map<string, Promise<FoodUnit[]>>()

function cleanUnits(raw: unknown): FoodUnit[] {
  if (!Array.isArray(raw)) return []
  const units: FoodUnit[] = []
  for (const item of raw) {
    const label = typeof item?.label === 'string' ? item.label.trim().slice(0, 30) : ''
    const grams = num(item?.grams)
    if (label && grams > 0 && grams <= 5000 && !/^(g|gramm)$/i.test(label)) units.push({ label, grams: round1(grams) })
  }
  return units.slice(0, 8)
}

function cleanGroups(raw: unknown): VariantGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const groups: VariantGroup[] = []
  for (const group of raw.slice(0, 3)) {
    const name = typeof group?.name === 'string' ? group.name.trim().slice(0, 20) : ''
    const choices: VariantChoice[] = []
    for (const choice of Array.isArray(group?.choices) ? group.choices.slice(0, 8) : []) {
      const label = typeof choice?.label === 'string' ? choice.label.trim().slice(0, 24) : ''
      if (!label) continue
      const out: VariantChoice = { label }
      const grams = num(choice.grams)
      if (grams > 0 && grams <= 5000) out.grams = round1(grams)
      const per100: Partial<Per100> = {}
      if (choice.kcal != null && num(choice.kcal) >= 0) per100.kcal = num(choice.kcal)
      if (choice.protein_g != null) per100.protein = num(choice.protein_g)
      if (choice.carbs_g != null) per100.carbs = num(choice.carbs_g)
      if (choice.fat_g != null) per100.fat = num(choice.fat_g)
      if (Object.keys(per100).length) out.per100 = per100
      choices.push(out)
    }
    if (name && choices.length > 1) groups.push({ name, choices, defaultIndex: Math.min(choices.length - 1, Math.max(0, Math.floor(num(group.default_index)))) })
  }
  return groups.length ? groups : undefined
}

/** Fragt die KI mit Websuche nach allgemeinen Lebensmitteln inkl. Größen, Reifegraden und Einheiten. */
export function searchWebFoods(query: string): Promise<FoodEntry[]> {
  const key = normalize(query)
  const cached = webCache.get(key)
  if (cached) return cached
  const request = (async () => {
    const { data, error } = await supabase.functions.invoke('food-search', { body: { mode: 'search', query } })
    if (error || !Array.isArray(data?.foods)) throw new Error('web')
    const entries: FoodEntry[] = []
    for (const [index, item] of (data.foods as Record<string, unknown>[]).entries()) {
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, 80) : ''
      const kcal = num(item.kcal)
      if (!name || kcal <= 0 || kcal > 900) continue
      entries.push({
        id: `web-${key}-${index}`,
        name,
        brand: typeof item.brand === 'string' && item.brand.trim() ? item.brand.trim().slice(0, 40) : undefined,
        source: 'web',
        per100: { kcal, protein: num(item.protein_g), carbs: num(item.carbs_g), fat: num(item.fat_g) },
        units: cleanUnits(item.units),
        groups: cleanGroups(item.groups),
      })
    }
    return entries
  })()
  webCache.set(key, request)
  request.catch(() => webCache.delete(key)) // Fehler nicht merken, damit ein neuer Versuch möglich ist
  return request
}

/** Fragt Stück-/Portionsgrößen für ein Produkt ab (z. B. „1 Keks = 11 g“). */
export function fetchWebUnits(entry: FoodEntry): Promise<FoodUnit[]> {
  const key = normalize(`${entry.name} ${entry.brand ?? ''}`)
  const cached = unitCache.get(key)
  if (cached) return cached
  const request = (async () => {
    const { data, error } = await supabase.functions.invoke('food-search', {
      body: { mode: 'portions', query: entry.name, brand: entry.brand ?? null },
    })
    if (error) throw new Error('units')
    return cleanUnits(data?.units)
  })()
  unitCache.set(key, request)
  request.catch(() => unitCache.delete(key))
  return request
}

// ─── Eigene Einheiten (lokal gemerkt) ───────────────────────────────────────────────────────────────────

const CUSTOM_UNITS_KEY = 'hlx-food-units'

export const unitKey = (entry: FoodEntry) => entry.barcode ?? normalize(`${entry.name} ${entry.brand ?? ''}`)

function readCustomUnits(): Record<string, FoodUnit[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_UNITS_KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function loadCustomUnits(entry: FoodEntry): FoodUnit[] {
  return cleanUnits(readCustomUnits()[unitKey(entry)])
}

export function saveCustomUnit(entry: FoodEntry, unit: FoodUnit) {
  try {
    const all = readCustomUnits()
    const key = unitKey(entry)
    const rest = (all[key] ?? []).filter(existing => existing.label.toLowerCase() !== unit.label.toLowerCase())
    all[key] = [...rest, unit].slice(-6)
    localStorage.setItem(CUSTOM_UNITS_KEY, JSON.stringify(all))
  } catch { /* optional */ }
}

// ─── Auswahl auflösen (Varianten + Einheit → Nährwerte) ──────────────────────────────────────────────────────────

export interface Resolved {
  per100: Per100
  units: FoodUnit[]
  variantLabels: string[]
}

/** Wendet die gewählten Varianten an: abweichende Nährwerte und das Gewicht der ersten Einheit (Stück). */
export function resolveEntry(entry: FoodEntry, choice: number[], extraUnits: FoodUnit[]): Resolved {
  let per100 = entry.per100
  const units = entry.units.map(unit => ({ ...unit }))
  const variantLabels: string[] = []
  entry.groups?.forEach((group, groupIndex) => {
    const picked = group.choices[choice[groupIndex] ?? group.defaultIndex ?? 0]
    if (!picked) return
    variantLabels.push(picked.label)
    if (picked.per100) per100 = { ...per100, ...picked.per100 }
    if (picked.grams && units[0]) units[0] = { ...units[0], grams: picked.grams }
    else if (picked.grams) units.push({ label: 'Stück', grams: picked.grams })
  })
  for (const extra of extraUnits) {
    if (!units.some(unit => unit.label.toLowerCase() === extra.label.toLowerCase())) units.push(extra)
  }
  const sorted = [...units.filter(unit => !isPackUnit(unit.label)), ...units.filter(unit => isPackUnit(unit.label))]
  return { per100, units: sorted, variantLabels }
}

const PACK_WORDS = /^(packung|pack|tüte|tuete|beutel|flasche|schachtel|tafel)/i
/** Verpackungs-Einheiten (Packung, Dose, Tüte …) – werden nie automatisch vorgewählt und stehen hinten. */
export const isPackUnit = (label: string) => PACK_WORDS.test(label.trim())

export function macrosFor(per100: Per100, grams: number) {
  const factor = grams / 100
  return {
    kalorien: Math.round(per100.kcal * factor),
    protein_g: round1(per100.protein * factor),
    kohlenhydrate_g: round1(per100.carbs * factor),
    fett_g: round1(per100.fat * factor),
  }
}
