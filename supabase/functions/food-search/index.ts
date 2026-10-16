import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lebensmittel-Suche mit Websuche (Gemini + Google-Suche):
//  mode "search":   allgemeine Lebensmittel und Marken-Produkte inkl. Größen, Reifegraden und Einheiten
//  mode "portions": Stück-/Portionsgrößen eines Produkts (z. B. 1 Keks = 11 g)

const ALLOWED_ORIGINS = [
  'https://justinkaram14.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const GEMINI_MODEL = 'gemini-2.5-flash'

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const SEARCH_PROMPT = (query: string) => `Du bist eine Nährwert-Datenbank für Deutschland. Suche im Internet verlässliche Nährwertangaben (z. B. Hersteller-Angaben, Bundeslebensmittelschlüssel, Nährwerttabellen) zu: "${query}".

Gib bis zu 6 passende Lebensmittel oder Produkte zurück, das beste zuerst. Allgemeine Lebensmittel (z. B. Banane) und Marken-Produkte (z. B. Hanuta, Prinzenrolle) sind beide erwünscht.
Für jedes Ergebnis:
- Nährwerte immer PRO 100 g (Getränke pro 100 ml).
- units: übliche Einheiten neben Gramm mit Gewicht in Gramm, z. B. {"label":"Stück","grams":120}, {"label":"Keks","grams":11}, {"label":"Riegel","grams":22}, {"label":"Scheibe","grams":25}, {"label":"Packung","grams":400}. Das Gewicht des einzelnen Stücks kommt zuerst.
- groups: nur wenn es sinnvoll ist, Auswahl-Gruppen. Beispiel Banane: Gruppe "Größe" mit klein/mittel/groß (jeweils "grams" = Gewicht eines Stücks) und Gruppe "Reife" mit grün/reif/sehr reif (jeweils abweichende Nährwerte pro 100 g in kcal, protein_g, carbs_g, fat_g). default_index ist die übliche Auswahl (Zählung ab 0).
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"foods":[{"name":string,"brand":string|null,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,"units":[{"label":string,"grams":number}],"groups":[{"name":string,"default_index":number,"choices":[{"label":string,"grams"?:number,"kcal"?:number,"protein_g"?:number,"carbs_g"?:number,"fat_g"?:number}]}]}]}`

const PORTIONS_PROMPT = (name: string, brand: string | null) => `Suche im Internet, wie schwer ein einzelnes Stück bzw. eine Portion von diesem Produkt ist: "${name}"${brand ? ` von ${brand}` : ''}.
Beispiele: Prinzenrolle → 1 Keks = 11 g, Packung = 352 g. Hanuta → 1 Stück = 22 g.
Gib die üblichen Einheiten neben Gramm mit Gewicht in Gramm zurück (Einzelstück bzw. Portion zuerst, dann Packung). Wenn du es nicht sicher weißt, gib eine leere Liste zurück.
Antworte NUR mit einem JSON-Objekt ohne weiteren Text: {"units":[{"label":string,"grams":number}]}`

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function sanitizeUnits(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((u) => u && typeof u.label === 'string' && num(u.grams) > 0 && num(u.grams) <= 5000)
    .slice(0, 8)
    .map((u) => ({ label: String(u.label).slice(0, 30), grams: Math.round(num(u.grams) * 10) / 10 }))
}

function sanitizeFoods(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f) => f && typeof f.name === 'string' && num(f.kcal) > 0 && num(f.kcal) <= 900)
    .slice(0, 6)
    .map((f) => ({
      name: String(f.name).slice(0, 80),
      brand: typeof f.brand === 'string' ? f.brand.slice(0, 40) : null,
      kcal: Math.round(num(f.kcal)),
      protein_g: Math.round(num(f.protein_g) * 10) / 10,
      carbs_g: Math.round(num(f.carbs_g) * 10) / 10,
      fat_g: Math.round(num(f.fat_g) * 10) / 10,
      units: sanitizeUnits(f.units),
      groups: Array.isArray(f.groups) ? f.groups.slice(0, 3) : [],
    }))
}

async function askGemini(apiKey: string, prompt: string, useSearch: boolean) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 2048, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
  }
  if (useSearch) body.tools = [{ google_search: {} }]
  return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

serve(async (req) => {
  const cors = getCorsHeaders(req.headers.get('Origin'))
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401, cors)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'Server configuration error' }, 500, cors)
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401, cors)

  let body: { mode?: unknown; query?: unknown; brand?: unknown }
  try { body = await req.json() } catch { return json({ error: 'Invalid request body' }, 400, cors) }

  const mode = body.mode === 'portions' ? 'portions' : 'search'
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (query.length < 2 || query.length > 100) return json({ error: 'Invalid query' }, 400, cors)
  const brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim().slice(0, 60) : null

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return json({ error: 'AI service not configured' }, 503, cors)

  const prompt = mode === 'search' ? SEARCH_PROMPT(query.replace(/["\n]/g, ' ')) : PORTIONS_PROMPT(query.replace(/["\n]/g, ' '), brand?.replace(/["\n]/g, ' ') ?? null)

  try {
    let response = await askGemini(apiKey, prompt, true)
    // Ohne Websuche-Werkzeug (z. B. nicht freigeschaltet) trotzdem antworten
    if (response.status === 400 || response.status === 403) response = await askGemini(apiKey, prompt, false)
    if (!response.ok) {
      console.error('Gemini API error:', response.status, await response.text())
      if (response.status === 429) return json({ error: 'Zu viele Anfragen. Bitte warte einen Moment.' }, 429, cors)
      return json({ error: 'Suche fehlgeschlagen.' }, 502, cors)
    }
    const data = await response.json()
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
    const match = text.match(/\{[\s\S]*\}/)
    let parsed: { foods?: unknown; units?: unknown } = {}
    try { parsed = match ? JSON.parse(match[0]) : {} } catch { parsed = {} }
    return mode === 'search'
      ? json({ foods: sanitizeFoods(parsed.foods) }, 200, cors)
      : json({ units: sanitizeUnits(parsed.units) }, 200, cors)
  } catch (err) {
    console.error('Edge function error:', err)
    return json({ error: 'Internal server error' }, 500, cors)
  }
})
