import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

// Schickt eine Nachricht an alle Geräte eines Nutzers.
// Erlaubt ist das nur für sich selbst (z. B. Test-Nachricht) oder für den eigenen Coach-Klienten.

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://justinkaram14.github.io,https://youngshindy.github.io,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean)
const APP_URL = Deno.env.get('APP_URL') ?? 'https://justinkaram14.github.io/coaching-app/'

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  }
}

serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: auth, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !auth.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers })

  const { targetUserId, title, body, url } = await req.json().catch(() => ({}))
  if (!targetUserId || !title) return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers })

  if (targetUserId !== auth.user.id) {
    const { data: target } = await supabase.from('profiles').select('coach_id').eq('id', targetUserId).maybeSingle()
    if (!target || target.coach_id !== auth.user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers })
    }
  }

  webpush.setVapidDetails('mailto:justinkaram1410@gmail.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  const { data: subs } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', targetUserId)
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, reason: 'no subscription' }), { headers })

  const payload = JSON.stringify({ title, body: body ?? '', url: url || APP_URL })
  let sent = 0
  let lastError = ''
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 })
      sent++
    } catch (e: any) {
      lastError = String(e?.statusCode ?? e)
      if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.error('Push failed:', e?.statusCode, e?.body ?? e)
    }
  }
  return new Response(JSON.stringify({ sent, devices: subs.length, ...(sent === 0 ? { error: lastError } : {}) }), { headers })
})
