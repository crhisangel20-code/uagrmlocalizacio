// Guardián del modo sin internet · Mapa UAGRM
const CACHE_APP = 'uagrm-app-v1';
const CACHE_MAPA = 'uagrm-mapa'; // el mismo nombre que usa el botón "Guardar mapa"

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(nombres.map(function (n) {
        if (n !== CACHE_APP && n !== CACHE_MAPA) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Nunca guardar lo de Supabase ni de Google Analytics
  if (url.hostname.indexOf('supabase.co') !== -1 ||
      url.hostname.indexOf('google') !== -1) return;

  // Datos propios (index, senderos, manifest): primero internet, si no hay, la copia
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then(function (r) {
        var copia = r.clone();
        caches.open(CACHE_APP).then(function (c) { c.put(req, copia); });
        return r;
      }).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('/index.html') || caches.match('/');
        });
      })
    );
    return;
  }

  // Mapa y librerías externas: primero la copia guardada, si no, internet
  e.respondWith(
    caches.match(req).then(function (r) {
      return r || fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copia = resp.clone();
          caches.open(CACHE_APP).then(function (c) { c.put(req, copia); });
        }
        return resp;
      });
    })
  );
});
