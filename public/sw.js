const CACHE_NAME = 'coaching-app-v1'
const BASE = '/coaching-app'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll([BASE + '/', BASE + '/index.html'])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('supabase')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

self.addEventListener('push', (e) => {
  // Safari/iOS verlangt, dass jede Push-Nachricht auch angezeigt wird, sonst entzieht es die Erlaubnis.
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(
    self.registration.showNotification(data.title || 'HLX Together', {
      body: data.body || '',
      icon: BASE + '/icon-192.png',
      badge: BASE + '/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || BASE + '/' },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || BASE + '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(BASE))
      if (existing) {
        // Offene App nach vorn holen und zur richtigen Seite schicken (navigate() gibt es nicht überall)
        existing.postMessage({ type: 'hlx-navigate', url })
        return existing.focus()
      }
      return clients.openWindow(url)
    })
  )
})
