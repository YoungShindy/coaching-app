import { supabase } from '../lib/supabase'

// Push-Nachrichten auf mehreren Geräten (Android/Chrome, Windows/Mac, Safari am Mac, iPhone und iPad).
// Apple: Auf iPhone und iPad funktioniert Web-Push erst ab iOS/iPadOS 16.4 und nur, wenn die App über
// „Teilen → Zum Home-Bildschirm“ installiert und von dort geöffnet wurde. Safari am Mac (ab macOS 13) geht direkt im Browser.

export type PushState =
  | 'on'          // dieses Gerät ist angemeldet
  | 'off'         // möglich, aber noch nicht aktiviert
  | 'denied'      // im Browser/System blockiert
  | 'ios-install' // iPhone/iPad: erst zum Home-Bildschirm hinzufügen
  | 'ios-old'     // iPhone/iPad mit zu altem iOS
  | 'unsupported' // Browser kann kein Web-Push

const OPT_IN_KEY = 'hlx-push-user'

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches)

export const pushCapable = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Gerätename für die Geräteliste, z. B. „iPhone“, „Mac (Safari)“, „Android“. */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android-Handy' : 'Android-Tablet'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Computer'
  return `${os} (${browser})`
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const current = sub.options?.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  return a.length === key.length && a.every((v, i) => v === key[i])
}

/** Service Worker bereit? Ohne Zeitlimit würde `ready` in der Entwicklung ewig warten. */
async function readyRegistration(ms = 6000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>(res => setTimeout(() => res(null), ms))])
}

const readFlag = () => { try { return localStorage.getItem(OPT_IN_KEY) } catch { return null } }
const writeFlag = (v: string | null) => { try { v ? localStorage.setItem(OPT_IN_KEY, v) : localStorage.removeItem(OPT_IN_KEY) } catch { /* privat */ } }

export async function getPushState(): Promise<PushState> {
  if (!pushCapable()) {
    if (isIOS()) return isStandalone() ? 'ios-old' : 'ios-install'
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'off'
  const reg = await readyRegistration(3000)
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Zeitzone des Geräts speichern, damit Erinnerungen zur richtigen Ortszeit kommen. */
export async function saveTimezone(userId: string) {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) await supabase.from('client_settings').update({ timezone: tz }).eq('user_id', userId)
  } catch { /* Spalte fehlt noch oder offline */ }
}

async function saveSubscription(userId: string, sub: PushSubscription) {
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return
  const base = { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }
  const full = { ...base, user_agent: navigator.userAgent.slice(0, 250), device_label: deviceLabel(), last_seen_at: new Date().toISOString() }
  const { error } = await supabase.from('push_subscriptions').upsert(full, { onConflict: 'endpoint' })
  if (error) await supabase.from('push_subscriptions').upsert(base, { onConflict: 'user_id' }) // Datenbank noch ohne Migration: ein Gerät
}

async function ensureSubscription(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) { console.error('[Push] VITE_VAPID_PUBLIC_KEY fehlt im Build'); return null }
  const key = urlBase64ToUint8Array(vapidKey)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null } // alter Schlüssel würde einen AbortError auslösen
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  return sub
}

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'error'

/** Muss direkt aus einem Tipp/Klick aufgerufen werden (Safari verlangt das für die Berechtigungsfrage). */
export async function enablePush(userId: string): Promise<EnableResult> {
  if (!pushCapable()) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await readyRegistration()
    if (!reg) return 'error'
    const sub = await ensureSubscription(reg)
    if (!sub) return 'error'
    await saveSubscription(userId, sub)
    await saveTimezone(userId)
    writeFlag(userId)
    return 'ok'
  } catch (e) {
    console.error('Push-Aktivierung fehlgeschlagen:', e)
    return 'error'
  }
}

/** Beim Start, ohne Nachfrage: Wer Push auf diesem Gerät aktiviert hat, behält ein frisches Abo. */
export async function refreshPushSubscription(userId: string) {
  try {
    if (!pushCapable() || Notification.permission !== 'granted' || readFlag() !== userId) return
    const reg = await readyRegistration(4000)
    if (!reg) return
    const sub = await ensureSubscription(reg)
    if (sub) await saveSubscription(userId, sub)
    await saveTimezone(userId)
  } catch (e) {
    console.error('Push-Abo erneuern fehlgeschlagen:', e)
  }
}

export async function disablePush(userId: string) {
  try {
    const reg = await readyRegistration(3000)
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } finally {
    writeFlag(null)
  }
}

/** Beim Abmelden: dieses Gerät erhält keine Nachrichten mehr für das Konto. */
export async function forgetThisDevice(userId: string) {
  if (readFlag() === userId) await disablePush(userId).catch(() => {})
}

export interface PushDevice { id: string; endpoint: string; device_label: string | null; last_seen_at: string | null; thisDevice: boolean }

export async function listDevices(userId: string): Promise<PushDevice[]> {
  const { data } = await supabase.from('push_subscriptions').select('*').eq('user_id', userId)
  const reg = await readyRegistration(2000)
  const mine = (await reg?.pushManager.getSubscription())?.endpoint
  return ((data ?? []) as Record<string, any>[]).map(r => ({
    id: r.id, endpoint: r.endpoint, device_label: r.device_label ?? null, last_seen_at: r.last_seen_at ?? null, thisDevice: !!mine && r.endpoint === mine,
  }))
}

export async function removeDevice(id: string) {
  await supabase.from('push_subscriptions').delete().eq('id', id)
}

export async function sendPushToUser(targetUserId: string, title: string, body: string, url?: string) {
  const { data, error } = await supabase.functions.invoke('send-notification', { body: { targetUserId, title, body, url } })
  return { data: data as { sent?: number; devices?: number; error?: string } | null, error }
}
