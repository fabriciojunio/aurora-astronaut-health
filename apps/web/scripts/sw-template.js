// AURORA service worker. VERSION and PRECACHE are written above this line at build time.
// The app must work with no connection, so every file it needs is cached on install. Cached data is
// still checked against the SHA-256 manifest by the app, so the cache cannot slip in altered data.

const CACHE = `aurora-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aurora-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    // Network first for the page, so a new version is picked up as soon as there is a connection.
    event.respondWith(fetch(request).catch(() => caches.match('/', { ignoreVary: true })))
    return
  }
  // Module scripts are requested with an Origin header and the precache requests are not; servers
  // that answer with `Vary: Origin` would otherwise make every cached file miss when offline.
  event.respondWith(caches.match(request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit ?? fetchAndKeep(request)))
})

// A page served during a deploy can come from a newer build than this worker's list. Keeping every
// same-origin file that loads fine means the files the page really uses are there when offline.
function fetchAndKeep(request) {
  return fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(request, copy))
    }
    return response
  })
}
