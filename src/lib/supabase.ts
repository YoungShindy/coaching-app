import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Check your .env file.')
}

// Schreibzugriffe auf Tagesdaten melden sich per Ereignis, damit grüne Reiter und Zähler sofort nachziehen.
const WATCHED = /\/rest\/v1\/(gewicht|schlaf|training|food_log|supplement_log|supplements|wasser_log)(\?|$|\/)/
export const DATA_CHANGED_EVENT = 'hlx:data-changed'

const trackingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  try {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (method !== 'GET' && method !== 'HEAD' && res.ok) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (WATCHED.test(url)) window.dispatchEvent(new Event(DATA_CHANGED_EVENT))
    }
  } catch { /* Meldung ist optional */ }
  return res
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: { fetch: trackingFetch },
  }
)
