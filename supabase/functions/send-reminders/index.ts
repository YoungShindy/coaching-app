import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'
import {
  addDaysISO, decideAppointmentPushes, decideHabitPushes, localParts, needsStreak, safeTz, streakDays,
  type Candidate, type DayFacts, type EventRow, type SentRecord, type Settings,
} from '../_shared/reminders.ts'

// Wird alle 15 Minuten vom GitHub-Workflow aufgerufen (nur mit dem Service-Key).
// Pro Lauf: je Nutzer lokale Zeit bestimmen, Tagesdaten lesen, fällige Nachrichten wählen und an alle Geräte senden.
// Nachrichtenregeln stehen in ../_shared/reminders.ts und sind dort getestet.

const APP_URL = Deno.env.get('APP_URL') ?? 'https://justinkaram14.github.io/coaching-app/'
const MAIN_MEALS = ['Frühstück', 'Mittagessen', 'Abendessen']

interface Sub { user_id: string; endpoint: string; p256dh: string; auth: string }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)
  webpush.setVapidDetails('mailto:justinkaram1410@gmail.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

  const body = await req.json().catch(() => ({}))
  const now = body.now ? new Date(body.now) : new Date() // „now“ und „dryRun“ nur zum Testen mit dem Service-Key
  const dryRun = body.dryRun === true
  const onlyUser: string | undefined = body.userId

  const summary: { user: string; kind: string; ref: string; title: string; devices?: number }[] = []

  try {
    let subQuery = supabase.from('push_subscriptions').select('user_id, endpoint, p256dh, auth')
    if (onlyUser) subQuery = subQuery.eq('user_id', onlyUser)
    const { data: subRows, error: subErr } = await subQuery
    if (subErr) throw subErr
    const subsByUser = new Map<string, Sub[]>()
    for (const s of (subRows ?? []) as Sub[]) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])
    const userIds = [...subsByUser.keys()]
    if (!userIds.length) return json({ checked: 0, sent: [] })

    const { data: settingsRows } = await supabase.from('client_settings').select('*').in('user_id', userIds)
    const settingsBy = new Map<string, Settings & { user_id: string }>((settingsRows ?? []).map((s: any) => [s.user_id, s]))
    const clientIds = userIds.filter(id => settingsBy.has(id))
    if (!clientIds.length) return json({ checked: 0, sent: [] })

    // Zeitfenster der Abfragen: gestern bis morgen (UTC), das deckt alle Zeitzonen ab
    const utcToday = now.toISOString().slice(0, 10)
    const since = addDaysISO(utcToday, -1), until = addDaysISO(utcToday, 1)
    const range = (q: any) => q.in('user_id', clientIds).gte('datum', since).lte('datum', until)

    const [gewicht, schlaf, training, food, water, supps, suppLog, logRows] = await Promise.all([
      fetchAll<any>(() => range(supabase.from('gewicht').select('user_id, datum')).order('id')),
      fetchAll<any>(() => range(supabase.from('schlaf').select('user_id, datum')).order('id')),
      fetchAll<any>(() => range(supabase.from('training').select('user_id, datum, dauer_min, trainingstyp, created_at')).order('id')),
      fetchAll<any>(() => range(supabase.from('food_log').select('user_id, datum, mahlzeit')).order('id')),
      fetchAll<any>(() => range(supabase.from('wasser_log').select('user_id, datum, menge_ml')).order('id')),
      fetchAll<any>(() => supabase.from('supplements').select('user_id').in('user_id', clientIds).eq('aktiv', true).order('id')),
      fetchAll<any>(() => range(supabase.from('supplement_log').select('user_id, datum, eingenommen')).order('id')),
      fetchAll<any>(() => supabase.from('push_log').select('user_id, kind, ref, local_date').in('user_id', clientIds).gte('local_date', since).order('id')),
    ])

    for (const userId of clientIds) {
      const settings = settingsBy.get(userId)!
      const tz = safeTz(settings.timezone)
      const { date } = localParts(now, tz)
      const mine = <T extends { user_id: string; datum: string }>(rows: T[]) => rows.filter(r => r.user_id === userId && r.datum === date)

      const trainings = mine<any>(training).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      const meals = new Set(mine<any>(food).map(r => r.mahlzeit))
      const facts: DayFacts = {
        weight: mine(gewicht).length > 0,
        sleep: mine(schlaf).length > 0,
        training: trainings.length > 0,
        trainingMin: trainings[0]?.dauer_min ?? null,
        trainingType: trainings[0]?.trainingstyp ?? null,
        trainingAt: trainings[0]?.created_at ?? null,
        mealsMain: MAIN_MEALS.filter(m => meals.has(m)).length,
        supplementsTotal: supps.filter((r: any) => r.user_id === userId).length,
        supplementsTaken: Math.min(mine<any>(suppLog).filter(r => r.eingenommen).length, supps.filter((r: any) => r.user_id === userId).length),
        waterMl: mine<any>(water).reduce((a, r) => a + (r.menge_ml ?? 0), 0),
      }

      // Bereits verschickt (Gewohnheits-Nachrichten des heutigen lokalen Tages, Termine der letzten Tage)
      const sentAll: SentRecord[] = logRows.filter((r: any) => r.user_id === userId && (r.kind === 'appointment' || r.local_date === date))
        .map((r: any) => ({ kind: r.kind, ref: r.ref }))

      // Streak nur berechnen, wenn er gebraucht wird
      let streak = { days: 0, includesToday: false }
      if (needsStreak(now, settings, facts, sentAll)) {
        const dates = await loadActiveDates(supabase, userId, addDaysISO(date, -420))
        streak = streakDays(dates, date)
        if (streak.includesToday && !dryRun) await claim(supabase, userId, 'streak-checked', date, date)
        if (streak.includesToday) sentAll.push({ kind: 'streak-checked', ref: date })
      }

      const habit = decideHabitPushes({ now, settings, facts, streak, sent: sentAll, appUrl: APP_URL })
      const events = await loadEvents(supabase, userId, addDaysISO(date, -1), addDaysISO(date, 3))
      const appts = decideAppointmentPushes(events, now, settings, sentAll, APP_URL)

      for (const c of [...appts, ...habit]) {
        if (dryRun) { summary.push({ user: userId, kind: c.kind, ref: c.ref, title: c.title }); continue }
        const devices = await deliver(supabase, userId, subsByUser.get(userId) ?? [], c, date)
        if (devices > 0) summary.push({ user: userId, kind: c.kind, ref: c.ref, title: c.title, devices })
      }
    }
    return json({ checked: clientIds.length, dryRun, sent: summary })
  } catch (e) {
    console.error('send-reminders failed', e)
    return json({ error: String(e), sent: summary }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Liest alle Seiten einer Abfrage (Supabase liefert höchstens 1000 Zeilen pro Anfrage). */
async function fetchAll<T>(make: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if ((data?.length ?? 0) < 1000) break
  }
  return out
}

async function loadActiveDates(supabase: any, userId: string, since: string): Promise<Set<string>> {
  const dates = new Set<string>()
  for (const table of ['gewicht', 'schlaf', 'training', 'food_log']) {
    const rows = await fetchAll<{ datum: string }>(() => supabase.from(table).select('datum').eq('user_id', userId).gte('datum', since).order('datum', { ascending: false }).order('id'))
    for (const r of rows) dates.add(r.datum)
  }
  return dates
}

async function loadEvents(supabase: any, userId: string, from: string, to: string): Promise<EventRow[]> {
  const base = supabase.from('kalender_events')
  let res = await base.select('id, titel, datum, uhrzeit, erinnerung_min, training_vorlagen(name)')
    .eq('client_id', userId).gte('datum', from).lte('datum', to).not('uhrzeit', 'is', null)
  if (res.error) {
    // Migration noch nicht eingespielt: ohne die neuen Spalten lesen
    res = await supabase.from('kalender_events').select('id, titel, datum, uhrzeit')
      .eq('client_id', userId).gte('datum', from).lte('datum', to).not('uhrzeit', 'is', null)
  }
  return ((res.data ?? []) as any[]).map(e => ({
    id: e.id, titel: e.titel, datum: e.datum, uhrzeit: e.uhrzeit,
    erinnerung_min: e.erinnerung_min ?? null, vorlage_name: e.training_vorlagen?.name ?? null,
  }))
}

/** Trägt die Nachricht im Protokoll ein; schlägt fehl, wenn sie schon existiert (dann nicht noch einmal senden). */
async function claim(supabase: any, userId: string, kind: string, ref: string, localDate: string): Promise<boolean> {
  const { error } = await supabase.from('push_log').insert({ user_id: userId, kind, ref, local_date: localDate })
  // 23505 = gibt es schon (normal). Alles andere, z. B. fehlende Tabelle, soll in den Logs auffallen.
  if (error && error.code !== '23505') console.error('push_log nicht beschreibbar (Migration eingespielt?):', error.message)
  return !error
}

/** Sendet an alle Geräte des Nutzers. Abgemeldete Geräte (404/410) werden entfernt. Rückgabe: Anzahl erreichter Geräte. */
async function deliver(supabase: any, userId: string, subs: Sub[], c: Candidate, localDate: string): Promise<number> {
  if (!subs.length) return 0
  if (!(await claim(supabase, userId, c.kind, c.ref, localDate))) return 0
  const payload = JSON.stringify({ title: c.title, body: c.body, url: c.url, tag: `${c.kind}-${c.ref}` })
  const ttl = c.kind === 'appointment' ? 3600 : 4 * 3600
  let ok = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl, urgency: 'normal' })
      ok++
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      else console.error('Push fehlgeschlagen für', userId, e?.statusCode, e?.body ?? e)
    }
  }
  // Kein Gerät erreicht: Eintrag wieder löschen, damit der nächste Lauf es erneut versucht
  if (ok === 0) await supabase.from('push_log').delete().match({ user_id: userId, kind: c.kind, ref: c.ref })
  return ok
}
