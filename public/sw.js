// Quizzer service worker: makes the installed app load offline.
// - Pages: network-first, falling back to the cached shell, so a deploy shows up on the next launch.
// - /assets/*: cache-first (Vite file names are content-hashed, so they never change).
// - Google Fonts: stale-while-revalidate.
const SHELL = 'quizzer-shell-v1'
const ASSETS = 'quizzer-assets-v1'
const FONTS = 'quizzer-fonts-v1'
const KEEP = [SHELL, ASSETS, FONTS]
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate') {
    event.respondWith(navigate(req))
  } else if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req))
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req))
  }
})

// On first visit the page's bundle was fetched before this worker existed, so cache the shell
// and every hashed asset index.html references now; otherwise the app would not open offline.
async function precache() {
  const shell = await caches.open(SHELL)
  await shell.addAll(SHELL_URLS)
  const html = await (await shell.match('/')).text()
  await (await caches.open(ASSETS)).addAll(assetPaths(html))
}

function assetPaths(html) {
  return [...new Set(Array.from(html.matchAll(/\/assets\/[^"'\s)]+/g), (m) => m[0]))]
}

async function navigate(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const cache = await caches.open(SHELL)
      await cache.put('/', res.clone())
      pruneAssets(await res.clone().text()).catch(() => {})
    }
    return res
  } catch {
    return (await caches.match('/', { ignoreVary: true })) ?? Response.error()
  }
}

// Drop hashed assets the current index.html no longer references.
async function pruneAssets(html) {
  const live = new Set(assetPaths(html))
  if (live.size === 0) return
  const cache = await caches.open(ASSETS)
  for (const req of await cache.keys()) {
    if (!live.has(new URL(req.url).pathname)) await cache.delete(req)
  }
}

async function cacheFirst(req) {
  // ignoreVary: servers may send `Vary: Origin`, and the <script crossorigin> request carries an
  // Origin header the precache request did not. Hashed assets are immutable, so this is safe.
  const hit = await caches.match(req, { ignoreVary: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) (await caches.open(ASSETS)).put(req, res.clone())
  return res
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONTS)
  const hit = await cache.match(req)
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
      return res
    })
    .catch(() => hit)
  return hit ?? fresh
}
