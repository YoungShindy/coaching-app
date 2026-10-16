import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://justinkaram14.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
]

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'])
const ALLOWED_CONTEXTS = new Set(['nutrition', 'training', 'sleep', 'recipe_text'])

function nutritionPrompt(hint?: string): string {
  const base = 'Analysiere dieses Bild (Mahlzeit, Rezept, Lebensmitteletikett oder Screenshot). Schätze die Gesamtnährwerte und antworte NUR mit einem JSON-Objekt ohne weiteren Text: {"kalorien": number, "protein_g": number, "kohlenhydrate_g": number, "fett_g": number, "notizen": "kurze Beschreibung der Mahlzeit"}'
  if (hint) return `Wichtiger Hinweis des Nutzers: Das Essen ist tatsächlich "${hint}". Schätze die Nährwerte basierend auf diesem Hinweis (nicht auf dem optischen Eindruck). ${base}`
  return base
}

const PROMPTS: Record<string, string> = {
  nutrition: nutritionPrompt(),
  training: 'Analysiere diesen Screenshot einer Trainings-App oder Apple Watch Workout-Zusammenfassung. Extrahiere die Trainingsdaten und antworte NUR mit einem JSON-Objekt ohne weiteren Text. Für trainingstyp wähle einen aus: Kraft, Cardio, HIIT, Yoga, Stretching, Schwimmen, Radfahren, Laufen, Sonstiges. {"dauer_min": number | null, "avg_puls": number | null, "kalorien_verbrannt": number | null, "trainingstyp": string, "notizen": "kurze Beschreibung des Workouts"}',
  sleep: 'Analysiere diesen Screenshot einer Schlaf-App (Apple Health, Oura, Whoop, Garmin o.ä.). Extrahiere die Schlafdaten und antworte NUR mit einem JSON-Objekt ohne weiteren Text. Zeiten im Format HH:MM (24h). Schlafqualität als Zahl 1-10. Falls die HRV (Herzratenvariabilität, in Millisekunden) sichtbar ist, gib sie als hrv_ms an, sonst null. {"einschlafzeit": "HH:MM" | null, "aufwachzeit": "HH:MM" | null, "schlafqualitaet": number | null, "hrv_ms": number | null, "notizen": "kurze Zusammenfassung"}',
  recipe_text: 'Analysiere diesen Rezepttext oder diese Zutatenliste und schätze die Nährwerte PRO PORTION. Falls keine Portionszahl angegeben ist, nimm 1 Portion für die Gesamtmenge. Antworte NUR mit einem JSON-Objekt ohne weiteren Text: {"name": "Rezeptname oder Mahlzeitbeschreibung", "kalorien": number, "protein_g": number, "kohlenhydrate_g": number, "fett_g": number, "portionen": number}',
}

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const GEMINI_MODEL = 'gemini-2.5-flash'

function pickFlashModel(_apiKey: string): string {
  return GEMINI_MODEL
}

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const corsHeaders = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // --- AUTH: verify JWT belongs to a valid Supabase user ---
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // --- INPUT VALIDATION ---
  let body: { imageBase64?: unknown; mimeType?: unknown; context?: unknown; recipeText?: unknown; hint?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const { imageBase64, mimeType, context, recipeText, hint } = body

  if (typeof context !== 'string' || !ALLOWED_CONTEXTS.has(context)) {
    return new Response(JSON.stringify({ error: 'Invalid context' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const isTextContext = context === 'recipe_text'

  if (isTextContext) {
    if (typeof recipeText !== 'string' || recipeText.trim().length < 5) {
      return new Response(JSON.stringify({ error: 'Invalid recipe text' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (recipeText.length > 10_000) {
      return new Response(JSON.stringify({ error: 'Text zu lang. Maximum 10.000 Zeichen.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  } else {
    if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return new Response(JSON.stringify({ error: 'Invalid image type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
      return new Response(JSON.stringify({ error: 'Invalid image data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    if (imageBase64.length > 5_000_000) {
      return new Response(JSON.stringify({ error: 'Image too large. Maximum 5MB.' }), {
        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }

  // --- GEMINI API CALL ---
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'AI service not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const nutritionHint = context === 'nutrition' && typeof hint === 'string' && hint.trim() ? hint.trim() : undefined
  const prompt = context === 'nutrition' ? nutritionPrompt(nutritionHint) : PROMPTS[context]

  const geminiParts = isTextContext
    ? [{ text: `${prompt}\n\nText:\n${recipeText}` }]
    : [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: prompt },
      ]

  const model = await pickFlashModel(apiKey)

  try {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: geminiParts }],
        generationConfig: {
          maxOutputTokens: 512,
          // gemini-2.5-flash "denkt" sonst im 512-Token-Limit und liefert keinen Text
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.1,
        }
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Gemini API error:', response.status, errBody)
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte warte einen Moment und versuche es erneut.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ error: 'KI-Analyse fehlgeschlagen. Bitte versuche es erneut.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
